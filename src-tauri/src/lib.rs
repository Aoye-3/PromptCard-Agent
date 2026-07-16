use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{imageops, DynamicImage, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use std::panic;
use std::process::Command;
use std::sync::{atomic::{AtomicU64, Ordering}, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use xcap::Monitor as XCapMonitor;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const PROFILE_ROOT_ENV: &str = "PROMPTCARD_DESKTOP_PROFILE_ROOT";
const DEFAULT_PROFILE_ROOT: &str = "logs/desktop-profile";

fn write_desktop_log(message: impl AsRef<str>) {
    let Ok(root) = source_root() else {
        return;
    };
    let logs_dir = root.join("logs");
    if fs::create_dir_all(&logs_dir).is_err() {
        return;
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(logs_dir.join("desktop-shell.log"))
    {
        let _ = writeln!(file, "[{timestamp}] {}", message.as_ref());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitPullResult {
    ok: bool,
    source_root: String,
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShutdownResult {
    ok: bool,
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSourceConfig {
    repo_url: String,
    remote_name: String,
    branch: String,
    last_known_remote_commit: Option<String>,
    last_checked_at: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateChange {
    path: String,
    classification: String,
    reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateResult {
    ok: bool,
    current_commit: String,
    remote_commit: String,
    branch: String,
    changes: Vec<UpdateChange>,
    blocked_reasons: Vec<String>,
    backup_path: Option<String>,
    requires_dependency_install: bool,
    message: String,
}

const CAPTURE_TOOLBAR_LABEL: &str = "capture-toolbar";
const CAPTURE_SELECTION_LABEL: &str = "capture-selection";
const CAPTURE_START_TIMEOUT: Duration = Duration::from_secs(30);

struct CaptureSessionStore {
    next_id: AtomicU64,
    session: Mutex<Option<CaptureSession>>,
}

impl Default for CaptureSessionStore {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            session: Mutex::new(None),
        }
    }
}

struct CaptureSession {
    id: String,
    phase: CaptureSessionPhase,
}

enum CaptureSessionPhase {
    WaitingForSelector { center_x: i32, center_y: i32 },
    Capturing,
    Ready {
        frame: RgbaImage,
        captured_at: u128,
        monitor_name: String,
    },
}

struct CapturedMonitorFrame {
    frame: RgbaImage,
    captured_at: u128,
    monitor_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureSelection {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    surface_width: f64,
    surface_height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCaptureResult {
    data_url: String,
    filename: String,
    size: usize,
    width: u32,
    height: u32,
    captured_at: u128,
    origin: serde_json::Value,
}

struct GitCommandOutput {
    ok: bool,
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[tauri::command]
fn update_get_config() -> Result<UpdateSourceConfig, String> {
    let root = source_root()?;
    ensure_git_repository(&root)?;
    load_update_config(&root)
}

#[tauri::command]
fn update_save_config(config: UpdateSourceConfig) -> Result<UpdateSourceConfig, String> {
    let root = source_root()?;
    ensure_git_repository(&root)?;
    let normalized = normalize_update_config(&root, config)?;
    save_update_config(&root, &normalized)?;
    Ok(normalized)
}

#[tauri::command]
fn update_check() -> Result<UpdateResult, String> {
    let root = source_root()?;
    ensure_git_repository(&root)?;
    let mut config = load_update_config(&root)?;
    let current_commit = git_stdout(&root, &["rev-parse", "HEAD"])?;
    let remote_commit = ls_remote_commit(&root, &config)?;
    let now = unix_timestamp();
    config.last_known_remote_commit = Some(remote_commit.clone());
    config.last_checked_at = Some(now);
    save_update_config(&root, &config)?;

    Ok(UpdateResult {
        ok: true,
        current_commit: current_commit.clone(),
        remote_commit: remote_commit.clone(),
        branch: config.branch,
        changes: Vec::new(),
        blocked_reasons: Vec::new(),
        backup_path: None,
        requires_dependency_install: false,
        message: if current_commit == remote_commit {
            "Already up to date.".to_string()
        } else {
            "Remote update is available.".to_string()
        },
    })
}

#[tauri::command]
fn update_preview() -> Result<UpdateResult, String> {
    let root = source_root()?;
    ensure_git_repository(&root)?;
    let config = load_update_config(&root)?;
    preview_update(&root, &config)
}

#[tauri::command]
fn update_apply() -> Result<UpdateResult, String> {
    let root = source_root()?;
    ensure_git_repository(&root)?;
    let status = git_stdout(&root, &["status", "--porcelain"])?;
    if !status.trim().is_empty() {
        return Ok(UpdateResult {
            ok: false,
            current_commit: git_stdout(&root, &["rev-parse", "HEAD"]).unwrap_or_default(),
            remote_commit: String::new(),
            branch: current_branch(&root).unwrap_or_else(|_| "main".to_string()),
            changes: Vec::new(),
            blocked_reasons: vec!["Working tree has uncommitted changes; commit them before applying updates.".to_string()],
            backup_path: None,
            requires_dependency_install: false,
            message: "Update blocked by local source changes.".to_string(),
        });
    }

    let mut config = load_update_config(&root)?;
    let mut preview = preview_update(&root, &config)?;
    if !preview.blocked_reasons.is_empty() {
        preview.ok = false;
        preview.message = "Update blocked by protected or manual-review paths.".to_string();
        return Ok(preview);
    }

    let backup_path = create_profile_backup(&root)?;
    let merge = run_git(&root, &["merge", "--ff-only", "FETCH_HEAD"])?;
    if !merge.ok {
        preview.ok = false;
        preview.backup_path = Some(backup_path);
        preview.blocked_reasons.push(format!(
            "git merge --ff-only failed with exit code {}. {}{}",
            merge.exit_code, merge.stdout, merge.stderr
        ));
        preview.message = "Update could not be applied.".to_string();
        return Ok(preview);
    }

    let current_commit = git_stdout(&root, &["rev-parse", "HEAD"])?;
    config.last_known_remote_commit = Some(current_commit.clone());
    config.last_checked_at = Some(unix_timestamp());
    save_update_config(&root, &config)?;

    preview.ok = true;
    preview.current_commit = current_commit;
    preview.backup_path = Some(backup_path);
    preview.message = if preview.requires_dependency_install {
        "Source update applied. Restart and reinstall dependencies before continuing.".to_string()
    } else {
        "Source update applied. Restart the desktop shell before continuing.".to_string()
    };
    Ok(preview)
}

#[tauri::command]
async fn capture_begin_selection(
    app: tauri::AppHandle,
    state: tauri::State<'_, CaptureSessionStore>,
    allow_canvas: bool,
) -> Result<(), String> {
    let toolbar = app
        .get_webview_window(CAPTURE_TOOLBAR_LABEL)
        .ok_or_else(|| "Capture toolbar is not available.".to_string())?;
    let monitor = match toolbar.current_monitor() {
        Ok(Some(monitor)) => monitor,
        Ok(None) => {
            let _ = restore_capture_toolbar(&app);
            return Err("Capture toolbar is not assigned to a display.".to_string());
        }
        Err(error) => {
            let _ = restore_capture_toolbar(&app);
            return Err(format!("Failed to read capture toolbar monitor: {error}"));
        }
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let scale_factor = monitor.scale_factor();
    let center_x = monitor_position.x + (monitor_size.width / 2) as i32;
    let center_y = monitor_position.y + (monitor_size.height / 2) as i32;

    let mut session = state
        .session
        .lock()
        .map_err(|_| "Screenshot session lock is unavailable.".to_string())?;
    if session.is_some() {
        drop(session);
        let _ = restore_capture_toolbar(&app);
        return Err("A screenshot selection is already active.".to_string());
    }

    let session_id = format!(
        "capture-{}-{}",
        unix_timestamp_millis(),
        state.next_id.fetch_add(1, Ordering::Relaxed)
    );
    *session = Some(CaptureSession {
        id: session_id.clone(),
        phase: CaptureSessionPhase::WaitingForSelector { center_x, center_y },
    });
    drop(session);

    let logical_position = monitor_position.to_logical::<f64>(scale_factor);
    let logical_size = monitor_size.to_logical::<f64>(scale_factor);
    let selector_url = format!(
        "/?window=capture-selection&session={session_id}&allowCanvas={allow_canvas}"
    );
    let selector = WebviewWindowBuilder::new(&app, CAPTURE_SELECTION_LABEL, WebviewUrl::App(selector_url.into()))
        .title("PromptCard Screenshot Selection")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .resizable(false)
        .position(logical_position.x, logical_position.y)
        .inner_size(logical_size.width, logical_size.height)
        .build();

    if let Err(error) = selector {
        clear_capture_session(&state);
        let _ = restore_capture_toolbar(&app);
        return Err(format!("Failed to open screenshot selection: {error}"));
    }
    schedule_capture_start_timeout(app.clone(), session_id);
    Ok(())
}

#[tauri::command]
async fn capture_activate_selection(
    app: tauri::AppHandle,
    state: tauri::State<'_, CaptureSessionStore>,
    session_id: String,
) -> Result<(), String> {
    let toolbar = app
        .get_webview_window(CAPTURE_TOOLBAR_LABEL)
        .ok_or_else(|| "Capture toolbar is not available.".to_string())?;
    let selector = app
        .get_webview_window(CAPTURE_SELECTION_LABEL)
        .ok_or_else(|| "Screenshot selection window is not available.".to_string())?;
    let (center_x, center_y) = mark_capture_session_capturing(&state, &session_id)?;

    if let Err(error) = toolbar.hide() {
        clear_capture_session_if_matches(&state, &session_id);
        abort_capture_selection(&app);
        return Err(format!("Failed to hide capture toolbar: {error}"));
    }

    let started_at = Instant::now();
    write_desktop_log(format!("screenshot capture started; session={session_id}"));
    let capture = tauri::async_runtime::spawn_blocking(move || capture_monitor_frame(center_x, center_y))
        .await
        .map_err(|error| format!("Native screenshot worker failed: {error}"))
        .and_then(|result| result);
    let captured = match capture {
        Ok(captured) => captured,
        Err(error) => {
            write_desktop_log(format!("screenshot capture failed; session={session_id}; error={error}"));
            clear_capture_session_if_matches(&state, &session_id);
            abort_capture_selection(&app);
            return Err(error);
        }
    };

    complete_capture_session(&state, &session_id, captured)?;
    write_desktop_log(format!(
        "screenshot capture ready; session={session_id}; elapsed_ms={}",
        started_at.elapsed().as_millis()
    ));
    if let Err(error) = selector.show().and_then(|_| selector.set_focus()) {
        clear_capture_session_if_matches(&state, &session_id);
        abort_capture_selection(&app);
        return Err(format!("Failed to show screenshot selection: {error}"));
    }
    Ok(())
}

#[tauri::command]
fn capture_finish_selection(
    app: tauri::AppHandle,
    state: tauri::State<'_, CaptureSessionStore>,
    session_id: String,
    selection: CaptureSelection,
) -> Result<NativeCaptureResult, String> {
    let session = take_capture_session(&state, &session_id)?;
    let CaptureSessionPhase::Ready { frame, captured_at, monitor_name } = session.phase else {
        return Err("Screenshot capture is still preparing.".to_string());
    };
    let (crop, crop_rect) = match crop_native_frame(&frame, &selection) {
        Ok(crop) => crop,
        Err(error) => {
            abort_capture_selection(&app);
            return Err(error);
        }
    };
    let mut bytes = Cursor::new(Vec::new());
    if let Err(error) = DynamicImage::ImageRgba8(crop).write_to(&mut bytes, ImageFormat::Png) {
        abort_capture_selection(&app);
        return Err(format!("Failed to encode screenshot PNG: {error}"));
    }
    let bytes = bytes.into_inner();
    let filename = format!("screenshot-{captured_at}.png");

    Ok(NativeCaptureResult {
        data_url: format!("data:image/png;base64,{}", BASE64.encode(&bytes)),
        filename,
        size: bytes.len(),
        width: crop_rect.2,
        height: crop_rect.3,
        captured_at,
        origin: serde_json::json!({
            "type": "floating-toolbar",
            "engine": "xcap",
            "monitor": monitor_name,
            "selection": {
                "x": crop_rect.0,
                "y": crop_rect.1,
                "width": crop_rect.2,
                "height": crop_rect.3,
            }
        }),
    })
}

#[tauri::command]
fn capture_cancel_selection(
    app: tauri::AppHandle,
    state: tauri::State<'_, CaptureSessionStore>,
    session_id: String,
) -> Result<(), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Screenshot session lock is unavailable.".to_string())?;
    if let Some(active) = session.as_ref() {
        if active.id != session_id {
            return Err("Screenshot selection session does not match the active session.".to_string());
        }
    }
    *session = None;
    drop(session);
    if let Some(selector) = app.get_webview_window(CAPTURE_SELECTION_LABEL) {
        let _ = selector.close();
    }
    restore_capture_toolbar(&app)
}

fn crop_native_frame(
    frame: &RgbaImage,
    selection: &CaptureSelection,
) -> Result<(RgbaImage, (u32, u32, u32, u32)), String> {
    if !selection.surface_width.is_finite()
        || !selection.surface_height.is_finite()
        || selection.surface_width <= 0.0
        || selection.surface_height <= 0.0
    {
        return Err("Screenshot selection surface size is invalid.".to_string());
    }
    let min_x = selection.x.min(selection.x + selection.width).max(0.0);
    let min_y = selection.y.min(selection.y + selection.height).max(0.0);
    let max_x = selection.x.max(selection.x + selection.width).min(selection.surface_width);
    let max_y = selection.y.max(selection.y + selection.height).min(selection.surface_height);
    let x = ((min_x / selection.surface_width) * frame.width() as f64).round() as u32;
    let y = ((min_y / selection.surface_height) * frame.height() as f64).round() as u32;
    let right = ((max_x / selection.surface_width) * frame.width() as f64).round() as u32;
    let bottom = ((max_y / selection.surface_height) * frame.height() as f64).round() as u32;
    let width = right.saturating_sub(x);
    let height = bottom.saturating_sub(y);
    if width < 2 || height < 2 {
        return Err("Screenshot selection must be at least 2 pixels wide and high.".to_string());
    }
    Ok((imageops::crop_imm(frame, x, y, width, height).to_image(), (x, y, width, height)))
}

fn take_capture_session(state: &CaptureSessionStore, session_id: &str) -> Result<CaptureSession, String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Screenshot session lock is unavailable.".to_string())?;
    match session.as_ref() {
        Some(active) if active.id != session_id => {
            return Err("Screenshot selection session does not match the active session.".to_string());
        }
        Some(active) if !matches!(active.phase, CaptureSessionPhase::Ready { .. }) => {
            return Err("Screenshot capture is still preparing.".to_string());
        }
        None => return Err("No screenshot selection is active.".to_string()),
        Some(_) => {}
    }
    session.take().ok_or_else(|| "No screenshot selection is active.".to_string())
}

fn capture_monitor_frame(center_x: i32, center_y: i32) -> Result<CapturedMonitorFrame, String> {
    let native_monitor = XCapMonitor::from_point(center_x, center_y)
        .map_err(|error| format!("Could not resolve the display for screenshot capture: {error}"))?;
    let frame = native_monitor
        .capture_image()
        .map_err(|error| format!("Native screenshot capture failed: {error}"))?;
    Ok(CapturedMonitorFrame {
        frame,
        captured_at: unix_timestamp_millis(),
        monitor_name: native_monitor
            .friendly_name()
            .unwrap_or_else(|_| "Unknown display".to_string()),
    })
}

fn mark_capture_session_capturing(
    state: &CaptureSessionStore,
    session_id: &str,
) -> Result<(i32, i32), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Screenshot session lock is unavailable.".to_string())?;
    let active = session
        .as_mut()
        .ok_or_else(|| "No screenshot selection is active.".to_string())?;
    if active.id != session_id {
        return Err("Screenshot selection session does not match the active session.".to_string());
    }
    let CaptureSessionPhase::WaitingForSelector { center_x, center_y } = active.phase else {
        return Err("Screenshot capture has already been activated.".to_string());
    };
    active.phase = CaptureSessionPhase::Capturing;
    Ok((center_x, center_y))
}

fn complete_capture_session(
    state: &CaptureSessionStore,
    session_id: &str,
    captured: CapturedMonitorFrame,
) -> Result<(), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Screenshot session lock is unavailable.".to_string())?;
    let active = session
        .as_mut()
        .ok_or_else(|| "Screenshot selection was cancelled.".to_string())?;
    if active.id != session_id || !matches!(active.phase, CaptureSessionPhase::Capturing) {
        return Err("Screenshot selection session is no longer active.".to_string());
    }
    active.phase = CaptureSessionPhase::Ready {
        frame: captured.frame,
        captured_at: captured.captured_at,
        monitor_name: captured.monitor_name,
    };
    Ok(())
}

fn clear_capture_session(state: &CaptureSessionStore) {
    if let Ok(mut session) = state.session.lock() {
        *session = None;
    }
}

fn clear_capture_session_if_matches(state: &CaptureSessionStore, session_id: &str) -> bool {
    if let Ok(mut session) = state.session.lock() {
        if session.as_ref().is_some_and(|active| active.id == session_id) {
            *session = None;
            return true;
        }
    }
    false
}

fn schedule_capture_start_timeout(app: tauri::AppHandle, session_id: String) {
    thread::spawn(move || {
        thread::sleep(CAPTURE_START_TIMEOUT);
        let Some(state) = app.try_state::<CaptureSessionStore>() else {
            return;
        };
        let should_abort = state
            .session
            .lock()
            .map(|session| {
                session.as_ref().is_some_and(|active| {
                    active.id == session_id && !matches!(active.phase, CaptureSessionPhase::Ready { .. })
                })
            })
            .unwrap_or(false);
        if should_abort && clear_capture_session_if_matches(&state, &session_id) {
            write_desktop_log(format!("screenshot capture timed out; session={session_id}"));
            abort_capture_selection(&app);
        }
    });
}

fn abort_capture_selection(app: &tauri::AppHandle) {
    if let Some(selector) = app.get_webview_window(CAPTURE_SELECTION_LABEL) {
        let _ = selector.close();
    }
    let _ = restore_capture_toolbar(app);
}

fn restore_capture_toolbar(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(toolbar) = app.get_webview_window(CAPTURE_TOOLBAR_LABEL) {
        toolbar
            .show()
            .map_err(|error| format!("Failed to restore capture toolbar: {error}"))?;
        toolbar
            .set_focus()
            .map_err(|error| format!("Failed to focus capture toolbar: {error}"))?;
        let _ = toolbar.emit("capture:toolbar-restored", ());
    }
    Ok(())
}

#[tauri::command]
fn git_pull_source() -> Result<GitPullResult, String> {
    let source_root = source_root()?;
    ensure_git_repository(&source_root)?;
    ensure_clean_worktree(&source_root)?;

    let output = Command::new("git")
        .current_dir(&source_root)
        .args(["pull", "--ff-only"])
        .output()
        .map_err(|error| format!("Failed to run git pull: {error}"))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let result = GitPullResult {
        ok: output.status.success(),
        source_root: path_to_string(&source_root)?,
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code,
    };

    if result.ok {
        Ok(result)
    } else {
        Err(format!(
            "git pull --ff-only failed with exit code {exit_code}.\n{}{}",
            result.stdout, result.stderr
        ))
    }
}

#[tauri::command]
fn shutdown_local_services() -> Result<ShutdownResult, String> {
    shutdown_promptcard_services()
}

fn shutdown_promptcard_services() -> Result<ShutdownResult, String> {
    let source_root = path_to_string(&source_root()?)?;
    let source_root_literal = powershell_single_quoted(&source_root);
    let script = format!(
        r#"
$ErrorActionPreference = 'Continue'
$sourceRoot = {source_root_literal}
$ports = New-Object System.Collections.Generic.List[int]
@(3000, 8001, 8002) | ForEach-Object {{ [void]$ports.Add([int]$_) }}
$manifestCandidates = @($env:PROMPTCARD_DEV_RUNTIME_MANIFEST, (Join-Path $sourceRoot 'logs\dev-runtime.json')) |
  Where-Object {{ $_ -and (Test-Path -LiteralPath $_) }} |
  Select-Object -Unique
foreach ($manifestPath in $manifestCandidates) {{
  try {{
    $runtime = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    foreach ($port in @($runtime.ports.frontend, $runtime.ports.agent, $runtime.ports.storage)) {{
      if ($port) {{ [void]$ports.Add([int]$port) }}
    }}
    foreach ($url in @($runtime.frontendUrl, $runtime.agentUrl, $runtime.agentHealthUrl, $runtime.storageUrl, $runtime.storageHealthUrl)) {{
      if (!$url) {{ continue }}
      try {{ [void]$ports.Add(([System.Uri][string]$url).Port) }} catch {{ }}
    }}
  }} catch {{
    Write-Output "Failed to read runtime manifest $manifestPath`: $($_.Exception.Message)"
  }}
}}
$targetPorts = @($ports | Where-Object {{ $_ -gt 0 }} | Sort-Object -Unique)
$connections = Get-NetTCPConnection -LocalPort $targetPorts -State Listen -ErrorAction SilentlyContinue
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
function Test-PromptCardProcess($process, $parentProcess) {{
  if (!$process) {{ return $false }}
  $commandLine = [string]$process.CommandLine
  $parentCommandLine = if ($parentProcess) {{ [string]$parentProcess.CommandLine }} else {{ '' }}
  return $commandLine.Contains($sourceRoot) -or $parentCommandLine.Contains($sourceRoot)
}}
foreach ($processId in $processIds) {{
  if (!$processId) {{ continue }}
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (!$process) {{ continue }}
  $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue
  if (Test-PromptCardProcess $process $parentProcess) {{
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped $processId $($process.Name)"
    $grandParentProcess = if ($parentProcess) {{ Get-CimInstance Win32_Process -Filter "ProcessId=$($parentProcess.ParentProcessId)" -ErrorAction SilentlyContinue }} else {{ $null }}
    if (Test-PromptCardProcess $parentProcess $grandParentProcess) {{
      Stop-Process -Id $parentProcess.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Output "Stopped parent $($parentProcess.ProcessId) $($parentProcess.Name)"
    }}
  }} else {{
    Write-Output "Skipped $processId $($process.Name)"
  }}
}}
"#
    );

    let mut command = Command::new("powershell");
    command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script.as_str()]);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command
        .output()
        .map_err(|error| format!("Failed to run local service shutdown: {error}"))?;

    let exit_code = output.status.code().unwrap_or(-1);
    let result = ShutdownResult {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code,
    };

    if result.ok {
        Ok(result)
    } else {
        Err(format!(
            "Local service shutdown failed with exit code {exit_code}.\n{}{}",
            result.stdout, result.stderr
        ))
    }
}

fn profile_root(source_root: &Path) -> PathBuf {
    std::env::var(PROFILE_ROOT_ENV)
        .map(PathBuf::from)
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                source_root.join(path)
            }
        })
        .unwrap_or_else(|_| source_root.join(DEFAULT_PROFILE_ROOT))
}

fn update_config_path(source_root: &Path) -> PathBuf {
    profile_root(source_root).join("config").join("update-source.json")
}

fn load_update_config(source_root: &Path) -> Result<UpdateSourceConfig, String> {
    let path = update_config_path(source_root);
    let stored = if path.exists() {
        let text = fs::read_to_string(&path)
            .map_err(|error| format!("Failed to read update config {}: {error}", path_to_string(&path).unwrap_or_default()))?;
        Some(serde_json::from_str::<UpdateSourceConfig>(&text).map_err(|error| {
            format!("Failed to parse update config {}: {error}", path_to_string(&path).unwrap_or_default())
        })?)
    } else {
        None
    };

    normalize_update_config(
        source_root,
        stored.unwrap_or(UpdateSourceConfig {
            repo_url: String::new(),
            remote_name: "origin".to_string(),
            branch: String::new(),
            last_known_remote_commit: None,
            last_checked_at: None,
        }),
    )
}

fn normalize_update_config(source_root: &Path, config: UpdateSourceConfig) -> Result<UpdateSourceConfig, String> {
    let remote_name = if config.remote_name.trim().is_empty() {
        "origin".to_string()
    } else {
        config.remote_name.trim().to_string()
    };
    let branch = if config.branch.trim().is_empty() {
        current_branch(source_root)?
    } else {
        config.branch.trim().to_string()
    };
    let repo_url = if config.repo_url.trim().is_empty() {
        git_stdout(source_root, &["remote", "get-url", remote_name.as_str()]).unwrap_or_default()
    } else {
        config.repo_url.trim().to_string()
    };

    Ok(UpdateSourceConfig {
        repo_url,
        remote_name,
        branch,
        last_known_remote_commit: config.last_known_remote_commit,
        last_checked_at: config.last_checked_at,
    })
}

fn save_update_config(source_root: &Path, config: &UpdateSourceConfig) -> Result<(), String> {
    let path = update_config_path(source_root);
    let parent = path
        .parent()
        .ok_or_else(|| format!("Update config path has no parent: {path:?}"))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create update config directory {}: {error}", path_to_string(parent).unwrap_or_default()))?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Failed to serialize update config: {error}"))?;
    fs::write(&path, json)
        .map_err(|error| format!("Failed to write update config {}: {error}", path_to_string(&path).unwrap_or_default()))
}

fn preview_update(source_root: &Path, config: &UpdateSourceConfig) -> Result<UpdateResult, String> {
    if config.repo_url.trim().is_empty() {
        return Err("Update source repoUrl is empty. Configure a GitHub repository URL first.".to_string());
    }

    let fetch = run_git(
        source_root,
        &["fetch", "--no-tags", config.repo_url.as_str(), config.branch.as_str()],
    )?;
    if !fetch.ok {
        return Err(format!(
            "git fetch failed with exit code {}. {}{}",
            fetch.exit_code, fetch.stdout, fetch.stderr
        ));
    }

    let current_commit = git_stdout(source_root, &["rev-parse", "HEAD"])?;
    let remote_commit = git_stdout(source_root, &["rev-parse", "FETCH_HEAD"])?;
    let changed_paths = git_stdout(source_root, &["diff", "--name-only", "HEAD..FETCH_HEAD"])?;
    let changes = changed_paths
        .lines()
        .filter(|path| !path.trim().is_empty())
        .map(classify_update_path)
        .collect::<Vec<_>>();
    let blocked_reasons = blocked_reasons_for_changes(&changes);
    let requires_dependency_install = requires_dependency_install_from_changes(&changes);

    Ok(UpdateResult {
        ok: blocked_reasons.is_empty(),
        current_commit,
        remote_commit,
        branch: config.branch.clone(),
        changes,
        blocked_reasons,
        backup_path: None,
        requires_dependency_install,
        message: if changed_paths.trim().is_empty() {
            "Already up to date.".to_string()
        } else {
            "Update preview is ready.".to_string()
        },
    })
}

fn create_profile_backup(source_root: &Path) -> Result<String, String> {
    let profile = profile_root(source_root);
    let backup_root = profile.join("backups").join(format!("source-update-{}", unix_timestamp()));
    fs::create_dir_all(&backup_root)
        .map_err(|error| format!("Failed to create backup directory {}: {error}", path_to_string(&backup_root).unwrap_or_default()))?;

    for name in ["data", "config", "agent-runtime", "logs"] {
        let source = profile.join(name);
        if source.exists() {
            copy_path_recursive(&source, &backup_root.join(name))?;
        }
    }

    path_to_string(&backup_root)
}

fn copy_path_recursive(source: &Path, target: &Path) -> Result<(), String> {
    if source.is_dir() {
        fs::create_dir_all(target)
            .map_err(|error| format!("Failed to create backup directory {}: {error}", path_to_string(target).unwrap_or_default()))?;
        for entry in fs::read_dir(source)
            .map_err(|error| format!("Failed to read backup source {}: {error}", path_to_string(source).unwrap_or_default()))?
        {
            let entry = entry.map_err(|error| format!("Failed to read backup entry: {error}"))?;
            copy_path_recursive(&entry.path(), &target.join(entry.file_name()))?;
        }
    } else {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Failed to create backup parent {}: {error}", path_to_string(parent).unwrap_or_default()))?;
        }
        fs::copy(source, target).map_err(|error| {
            format!(
                "Failed to copy backup file {} to {}: {error}",
                path_to_string(source).unwrap_or_default(),
                path_to_string(target).unwrap_or_default()
            )
        })?;
    }
    Ok(())
}

fn classify_update_path(path: &str) -> UpdateChange {
    let normalized = path.replace('\\', "/");
    if is_protected_update_path(&normalized) {
        return UpdateChange {
            path: normalized,
            classification: "protected".to_string(),
            reason: "User data, profile config, local credentials, or runtime state must not be overwritten.".to_string(),
        };
    }

    if is_source_update_path(&normalized) {
        return UpdateChange {
            path: normalized,
            classification: "source".to_string(),
            reason: "Managed source or documentation path.".to_string(),
        };
    }

    UpdateChange {
        path: normalized,
        classification: "manual-review".to_string(),
        reason: "Path is not in the automatic source allowlist.".to_string(),
    }
}

fn is_protected_update_path(path: &str) -> bool {
    path == "data"
        || path.starts_with("data/")
        || path == "backups"
        || path.starts_with("backups/")
        || path == "logs/desktop-profile"
        || path.starts_with("logs/desktop-profile/")
        || path == "agent-runtime/.promptcard-runtime"
        || path.starts_with("agent-runtime/.promptcard-runtime/")
        || path == "agent-runtime/.agent"
        || path.starts_with("agent-runtime/.agent/")
        || path.starts_with(".env")
        || path.contains("/.env")
        || path.ends_with("API-Key.txt")
}

fn is_source_update_path(path: &str) -> bool {
    let source_prefixes = [
        "src/",
        "src-tauri/",
        "scripts/",
        "promptcard_storage/",
        "docs/",
        "public/",
        "vite/",
        "agent-runtime/backend/",
        "text-agent-runtime/",
    ];
    let source_files = [
        ".gitignore",
        "AGENTS.md",
        "CLAUDE.md",
        "README.md",
        "index.html",
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "tsconfig.json",
        "tsconfig.node.json",
        "vite.config.ts",
        "tailwind.config.js",
        "postcss.config.js",
        ".eslintrc.cjs",
        "start-desktop.bat",
    ];
    source_prefixes.iter().any(|prefix| path.starts_with(prefix)) || source_files.contains(&path)
}

fn blocked_reasons_for_changes(changes: &[UpdateChange]) -> Vec<String> {
    changes
        .iter()
        .filter(|change| change.classification != "source")
        .map(|change| format!("{}: {}", change.path, change.reason))
        .collect()
}

fn requires_dependency_install_from_changes(changes: &[UpdateChange]) -> bool {
    changes.iter().any(|change| {
        matches!(
            change.path.as_str(),
            "package.json"
                | "package-lock.json"
                | "pnpm-lock.yaml"
                | "yarn.lock"
                | "src-tauri/Cargo.toml"
                | "src-tauri/Cargo.lock"
        )
    })
}

fn current_branch(source_root: &Path) -> Result<String, String> {
    let branch = git_stdout(source_root, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    if branch == "HEAD" || branch.trim().is_empty() {
        Ok("main".to_string())
    } else {
        Ok(branch)
    }
}

fn ls_remote_commit(source_root: &Path, config: &UpdateSourceConfig) -> Result<String, String> {
    if config.repo_url.trim().is_empty() {
        return Err("Update source repoUrl is empty. Configure a GitHub repository URL first.".to_string());
    }

    let reference = format!("refs/heads/{}", config.branch);
    let output = run_git(source_root, &["ls-remote", config.repo_url.as_str(), reference.as_str()])?;
    if !output.ok {
        return Err(format!(
            "git ls-remote failed with exit code {}. {}{}",
            output.exit_code, output.stdout, output.stderr
        ));
    }

    output
        .stdout
        .split_whitespace()
        .next()
        .map(str::to_string)
        .filter(|commit| !commit.is_empty())
        .ok_or_else(|| format!("Remote branch {} was not found at {}.", config.branch, config.repo_url))
}

fn git_stdout(source_root: &Path, args: &[&str]) -> Result<String, String> {
    let output = run_git(source_root, args)?;
    if output.ok {
        Ok(output.stdout.trim().to_string())
    } else {
        Err(format!(
            "git {} failed with exit code {}. {}{}",
            args.join(" "),
            output.exit_code,
            output.stdout,
            output.stderr
        ))
    }
}

fn run_git(source_root: &Path, args: &[&str]) -> Result<GitCommandOutput, String> {
    let output = Command::new("git")
        .current_dir(source_root)
        .args(args)
        .output()
        .map_err(|error| format!("Failed to run git {}: {error}", args.join(" ")))?;

    Ok(GitCommandOutput {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

fn unix_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn unix_timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn powershell_single_quoted(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn source_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Unable to resolve source root from CARGO_MANIFEST_DIR".to_string())
}

fn ensure_git_repository(source_root: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(source_root)
        .args(["rev-parse", "--is-inside-work-tree"])
        .output()
        .map_err(|error| format!("Failed to check git repository: {error}"))?;

    if output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true" {
        Ok(())
    } else {
        Err(format!("Source root is not a Git worktree: {}", path_to_string(source_root)?))
    }
}

fn ensure_clean_worktree(source_root: &Path) -> Result<(), String> {
    let output = Command::new("git")
        .current_dir(source_root)
        .args(["status", "--porcelain"])
        .output()
        .map_err(|error| format!("Failed to check git status: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "git status failed.\n{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let status = String::from_utf8_lossy(&output.stdout);
    if status.trim().is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Working tree has uncommitted changes. Commit or stash before pulling.\n{}",
            status
        ))
    }
}

fn path_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| format!("Path is not valid UTF-8: {path:?}"))
}

pub fn run() {
    panic::set_hook(Box::new(|info| {
        write_desktop_log(format!("panic: {info}"));
    }));
    write_desktop_log("desktop shell run starting");

    tauri::Builder::default()
        .manage(CaptureSessionStore::default())
        .setup(|app| {
            let labels = app
                .webview_windows()
                .keys()
                .cloned()
                .collect::<Vec<_>>()
                .join(",");
            write_desktop_log(format!("setup complete; windows={labels}"));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            git_pull_source,
            shutdown_local_services,
            update_get_config,
            update_save_config,
            update_check,
            update_preview,
            update_apply,
            capture_begin_selection,
            capture_activate_selection,
            capture_finish_selection,
            capture_cancel_selection
        ])
        .on_window_event(|window, event| {
            write_desktop_log(format!("window event: {} {:?}", window.label(), event));
            if window.label() == "main" && matches!(event, WindowEvent::CloseRequested { .. }) {
                write_desktop_log("main close requested; shutting down local services");
                if let Err(error) = shutdown_promptcard_services() {
                    write_desktop_log(format!("shutdown failed: {error}"));
                    eprintln!("Failed to stop PromptCard local services: {error}");
                }
                window.app_handle().exit(0);
            }
            if window.label() == CAPTURE_SELECTION_LABEL && matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Some(state) = window.app_handle().try_state::<CaptureSessionStore>() {
                    clear_capture_session(&state);
                }
                let _ = restore_capture_toolbar(&window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running PromptCard Manager Dev Shell");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_profile_and_runtime_paths_as_protected() {
        for path in [
            "data/promptcard.sqlite3",
            "logs/desktop-profile/data/assets/image.png",
            "agent-runtime/.promptcard-runtime/promptcard-model-connections.json",
            "agent-runtime/.agent/local-agent/config.yaml",
            "agent-runtime/backend/.env.local",
            ".env.local",
            "API-Key.txt",
        ] {
            let change = classify_update_path(path);
            assert_eq!(change.classification, "protected", "{path}");
        }
    }

    #[test]
    fn classifies_known_source_paths_as_source_owned() {
        for path in [
            "src/App.tsx",
            "src-tauri/src/lib.rs",
            "scripts/start-desktop-dev-services.ps1",
            "promptcard_storage/app.py",
            "docs/architecture/data-storage-and-update-system.md",
            "package.json",
            "agent-runtime/backend/app/gateway/app.py",
            "text-agent-runtime/src/server.ts",
        ] {
            let change = classify_update_path(path);
            assert_eq!(change.classification, "source", "{path}");
        }
    }

    #[test]
    fn classifies_unknown_paths_for_manual_review() {
        for path in [
            "private-notes/local-plan.md",
            "agent-runtime/local-overrides.json",
        ] {
            let change = classify_update_path(path);
            assert_eq!(change.classification, "manual-review", "{path}");
            assert_eq!(blocked_reasons_for_changes(&[change]).len(), 1);
        }
    }

    #[test]
    fn detects_dependency_manifest_changes() {
        let changes = vec![
            classify_update_path("src/App.tsx"),
            classify_update_path("package-lock.json"),
        ];

        assert!(requires_dependency_install_from_changes(&changes));
    }

    #[test]
    fn crops_native_frame_using_selector_coordinates() {
        let frame = RgbaImage::from_fn(1920, 1080, |_, _| image::Rgba([20, 40, 60, 255]));
        let selection = CaptureSelection {
            x: 120.0,
            y: 90.0,
            width: 960.0,
            height: 540.0,
            surface_width: 1440.0,
            surface_height: 810.0,
        };

        let (crop, rect) = crop_native_frame(&frame, &selection).expect("selection should crop");

        assert_eq!(rect, (160, 120, 1280, 720));
        assert_eq!(crop.dimensions(), (1280, 720));
    }

    #[test]
    fn rejects_native_frame_selection_smaller_than_two_pixels() {
        let frame = RgbaImage::new(100, 100);
        let selection = CaptureSelection {
            x: 0.0,
            y: 0.0,
            width: 1.0,
            height: 1.0,
            surface_width: 100.0,
            surface_height: 100.0,
        };

        assert!(crop_native_frame(&frame, &selection).is_err());
    }

    #[test]
    fn rejects_finishing_when_no_screenshot_session_is_active() {
        let state = CaptureSessionStore::default();
        let result = take_capture_session(&state, "capture-1");

        assert!(matches!(result, Err(error) if error == "No screenshot selection is active."));
    }

    #[test]
    fn clears_screenshot_session_state() {
        let state = CaptureSessionStore::default();
        *state.session.lock().unwrap() = Some(CaptureSession {
            id: "capture-1".to_string(),
            phase: CaptureSessionPhase::Ready {
                frame: RgbaImage::new(4, 4),
                captured_at: 1234,
                monitor_name: "Display 1".to_string(),
            },
        });

        clear_capture_session(&state);

        assert!(state.session.lock().unwrap().is_none());
    }

    #[test]
    fn keeps_waiting_session_until_selector_activates() {
        let state = CaptureSessionStore::default();
        *state.session.lock().unwrap() = Some(CaptureSession {
            id: "capture-1".to_string(),
            phase: CaptureSessionPhase::WaitingForSelector { center_x: 20, center_y: 30 },
        });

        let result = take_capture_session(&state, "capture-1");

        assert!(matches!(result, Err(error) if error == "Screenshot capture is still preparing."));
        assert!(state.session.lock().unwrap().is_some());
    }

    #[test]
    fn transitions_capture_session_from_waiting_to_ready() {
        let state = CaptureSessionStore::default();
        *state.session.lock().unwrap() = Some(CaptureSession {
            id: "capture-1".to_string(),
            phase: CaptureSessionPhase::WaitingForSelector { center_x: 20, center_y: 30 },
        });

        assert_eq!(mark_capture_session_capturing(&state, "capture-1").unwrap(), (20, 30));
        complete_capture_session(&state, "capture-1", CapturedMonitorFrame {
            frame: RgbaImage::new(4, 4),
            captured_at: 1234,
            monitor_name: "Display 1".to_string(),
        }).unwrap();

        assert!(take_capture_session(&state, "capture-1").is_ok());
    }
}
