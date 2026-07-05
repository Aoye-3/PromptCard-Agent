use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::panic;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
        .invoke_handler(tauri::generate_handler![git_pull_source, shutdown_local_services])
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
        })
        .run(tauri::generate_context!())
        .expect("error while running PromptCard Manager Dev Shell");
}
