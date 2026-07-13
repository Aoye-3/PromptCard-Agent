use serde::{Deserialize, Serialize};
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
        || path == "agent-runtime/.deer-flow"
        || path.starts_with("agent-runtime/.deer-flow/")
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
        "agent-runtime/scripts/",
        "agent-runtime/docker/",
        "agent-runtime/skills/public/",
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
        .invoke_handler(tauri::generate_handler![
            git_pull_source,
            shutdown_local_services,
            update_get_config,
            update_save_config,
            update_check,
            update_preview,
            update_apply
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
            "agent-runtime/.deer-flow/data/thread.json",
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
            "agent-runtime/backend/packages/harness/deerflow/agents/factory.py",
            "agent-runtime/scripts/check.py",
            "agent-runtime/docker/dev-entrypoint.sh",
            "agent-runtime/skills/public/bootstrap/SKILL.md",
        ] {
            let change = classify_update_path(path);
            assert_eq!(change.classification, "source", "{path}");
        }
    }

    #[test]
    fn classifies_unknown_paths_for_manual_review() {
        for path in [
            "private-notes/local-plan.md",
            "agent-runtime/config.yaml",
            "agent-runtime/skills/local/custom/SKILL.md",
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
}
