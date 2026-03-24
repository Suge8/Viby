use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use tauri::{AppHandle, Manager};

use crate::state::StartHubOptions;

const BUN_EXECUTABLE: &str = "bun";
const SHARED_VIBY_HOME_DIR: &str = ".viby";
const HUB_RUNTIME_STATUS_FILE: &str = "hub.runtime-status.json";
const HUB_DESKTOP_LOG_FILE: &str = "desktop-hub.log";
const SETTINGS_FILE_NAME: &str = "settings.toml";
const DEV_REPO_RELATIVE_ROOT_DEPTH: usize = 1;
#[cfg(target_os = "windows")]
const WINDOWS_CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn desktop_root_dir() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve desktop root.".to_string())
}

fn repo_root_dir() -> Result<PathBuf, String> {
    let mut current = desktop_root_dir()?;
    for _ in 0..DEV_REPO_RELATIVE_ROOT_DEPTH {
        current = current
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| "Failed to resolve repository root.".to_string())?;
    }
    Ok(current)
}

pub fn runtime_status_file_path() -> Result<PathBuf, String> {
    let viby_home_dir = resolve_shared_viby_home_dir()?;
    Ok(viby_home_dir.join(HUB_RUNTIME_STATUS_FILE))
}

pub fn settings_file_path() -> Result<PathBuf, String> {
    let viby_home_dir = resolve_shared_viby_home_dir()?;
    Ok(viby_home_dir.join(SETTINGS_FILE_NAME))
}

pub fn desktop_log_file_path() -> Result<PathBuf, String> {
    let viby_home_dir = resolve_shared_viby_home_dir()?;
    Ok(viby_home_dir.join("logs").join(HUB_DESKTOP_LOG_FILE))
}

fn resolve_home_dir() -> Result<PathBuf, String> {
    if cfg!(target_os = "windows") {
        return std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or_else(|| "Failed to resolve USERPROFILE.".to_string());
    }

    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "Failed to resolve HOME.".to_string())
}

pub fn resolve_shared_viby_home_dir() -> Result<PathBuf, String> {
    let home_dir = resolve_home_dir()?;
    Ok(home_dir.join(SHARED_VIBY_HOME_DIR))
}

fn current_target_triple() -> &'static str {
    if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        return "aarch64-apple-darwin";
    }

    if cfg!(target_os = "macos") && cfg!(target_arch = "x86_64") {
        return "x86_64-apple-darwin";
    }

    if cfg!(target_os = "windows") {
        return "x86_64-pc-windows-msvc";
    }

    if cfg!(target_os = "linux") && cfg!(target_arch = "aarch64") {
        return "aarch64-unknown-linux-gnu";
    }

    "x86_64-unknown-linux-gnu"
}

fn sidecar_binary_name() -> String {
    let base_name = format!("binaries/viby-sidecar-{}", current_target_triple());
    if cfg!(target_os = "windows") {
        return format!("{base_name}.exe");
    }
    base_name
}

fn configure_spawn_command(command: &mut Command) -> Result<(), String> {
    let log_path = desktop_log_file_path()?;
    if let Some(log_dir) = log_path.parent() {
        fs::create_dir_all(log_dir).map_err(|error| error.to_string())?;
    }
    let mut log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;
    writeln!(log_file, "\n===== {} =====", chrono_like_timestamp())
        .map_err(|error| error.to_string())?;
    let stderr_file = log_file.try_clone().map_err(|error| error.to_string())?;

    command.stdin(Stdio::null());
    command.stdout(Stdio::from(log_file));
    command.stderr(Stdio::from(stderr_file));

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(WINDOWS_CREATE_NO_WINDOW);
    }

    Ok(())
}

fn configure_hub_runtime_environment(
    command: &mut Command,
    options: &StartHubOptions,
) -> Result<(), String> {
    let viby_home_dir = resolve_shared_viby_home_dir()?;
    fs::create_dir_all(&viby_home_dir).map_err(|error| error.to_string())?;
    command.env("VIBY_HOME", &viby_home_dir);
    command.env("VIBY_LAUNCH_SOURCE", "desktop");
    command.env("VIBY_LISTEN_HOST", options.listen_host());

    Ok(())
}

fn append_hub_args(command: &mut Command) {
    command.arg("hub");
}

fn spawn_dev_hub(options: &StartHubOptions) -> Result<Child, String> {
    let repo_root = repo_root_dir()?;
    let cli_dir = repo_root.join("cli");
    let mut command = Command::new(BUN_EXECUTABLE);
    command.current_dir(cli_dir);
    command.arg("src/index.ts");
    append_hub_args(&mut command);
    configure_hub_runtime_environment(&mut command, options)?;
    configure_spawn_command(&mut command)?;
    command.spawn().map_err(|error| error.to_string())
}

fn spawn_packaged_hub(app: &AppHandle, options: &StartHubOptions) -> Result<Child, String> {
    let sidecar_path = resolve_packaged_sidecar_path(app)?;
    let mut command = Command::new(sidecar_path);
    append_hub_args(&mut command);
    configure_hub_runtime_environment(&mut command, options)?;
    configure_spawn_command(&mut command)?;
    command.spawn().map_err(|error| error.to_string())
}

pub fn spawn_hub_process(app: &AppHandle, options: &StartHubOptions) -> Result<Child, String> {
    if cfg!(debug_assertions) {
        return spawn_dev_hub(options);
    }

    spawn_packaged_hub(app, options)
}

fn resolve_packaged_sidecar_path(app: &AppHandle) -> Result<PathBuf, String> {
    let sidecar_file_name = packaged_sidecar_file_name();
    let current_exe = std::env::current_exe().map_err(|error| error.to_string())?;
    if let Some(executable_dir) = current_exe.parent() {
        let sibling_path = executable_dir.join(&sidecar_file_name);
        if sibling_path.exists() {
            return Ok(sibling_path);
        }
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let resource_path = resource_dir.join(sidecar_binary_name());
    if resource_path.exists() {
        return Ok(resource_path);
    }

    Err(format!(
        "Bundled sidecar not found. Tried {:?} and {:?}.",
        current_exe.parent().map(|dir| dir.join(&sidecar_file_name)),
        Some(resource_path)
    ))
}

fn packaged_sidecar_file_name() -> &'static str {
    if cfg!(target_os = "windows") {
        return "viby-sidecar.exe";
    }

    "viby-sidecar"
}

fn chrono_like_timestamp() -> String {
    match std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => format!(
            "unix:{}.{:03}",
            duration.as_secs(),
            duration.subsec_millis()
        ),
        Err(_) => "unix:0.000".to_string(),
    }
}
