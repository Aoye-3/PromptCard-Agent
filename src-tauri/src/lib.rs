use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::WindowEvent;

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
$ports = @(3000, 8001, 8002)
$connections = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
$processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
function Test-PromptCardProcess($process) {{
  if (!$process) {{ return $false }}
  $commandLine = [string]$process.CommandLine
  return $commandLine.Contains($sourceRoot) -or
    $commandLine.Contains('promptcard_storage') -or
    $commandLine.Contains('app.gateway.app:app') -or
    $commandLine.Contains('vite --strictPort') -or
    $commandLine.Contains('start-storage-service.ps1') -or
    $commandLine.Contains('start-agent-runtime.ps1') -or
    $commandLine.Contains('start-dev-with-agent.ps1') -or
    $commandLine.Contains('start-desktop-dev-services.ps1')
}}
foreach ($processId in $processIds) {{
  if (!$processId) {{ continue }}
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (!$process) {{ continue }}
  $parentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)" -ErrorAction SilentlyContinue
  if (Test-PromptCardProcess $process) {{
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Write-Output "Stopped $processId $($process.Name)"
    if (Test-PromptCardProcess $parentProcess) {{
      Stop-Process -Id $parentProcess.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Output "Stopped parent $($parentProcess.ProcessId) $($parentProcess.Name)"
    }}
  }} else {{
    Write-Output "Skipped $processId $($process.Name)"
  }}
}}
"#
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script.as_str()])
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![git_pull_source, shutdown_local_services])
        .on_window_event(|_window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                if let Err(error) = shutdown_promptcard_services() {
                    eprintln!("Failed to stop PromptCard local services: {error}");
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running PromptCard Manager Dev Shell");
}
