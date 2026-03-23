use std::fs;
use std::process::Child;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use std::thread::sleep;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use sysinfo::{Pid, ProcessesToUpdate, Signal, System};
use tauri::{AppHandle, Manager, State};

use crate::launch::{desktop_log_file_path, runtime_status_file_path, settings_file_path};

const STOP_WAIT_INTERVAL: Duration = Duration::from_millis(100);
const STOP_WAIT_ATTEMPTS: usize = 20;
const DEFAULT_VIBY_LISTEN_HOST: &str = "127.0.0.1";
const DEFAULT_VIBY_LISTEN_PORT: u16 = 37173;
const LAN_LISTEN_HOST: &str = "0.0.0.0";
const LOCAL_LISTEN_HOST: &str = "127.0.0.1";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HubStartupConfig {
    pub listen_host: String,
    pub listen_port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HubRuntimeStatus {
    pub phase: String,
    pub pid: u32,
    pub launch_source: Option<String>,
    pub relay_enabled: bool,
    pub listen_host: String,
    pub listen_port: u16,
    pub local_hub_url: String,
    pub preferred_browser_url: String,
    pub cli_api_token: String,
    pub settings_file: String,
    pub data_dir: String,
    pub started_at: String,
    pub updated_at: String,
    pub public_hub_url: Option<String>,
    pub direct_access_url: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubSnapshot {
    pub running: bool,
    pub managed: bool,
    pub last_error: Option<String>,
    pub log_path: String,
    pub startup_config: HubStartupConfig,
    pub status: Option<HubRuntimeStatus>,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum DesktopEntryMode {
    Local,
    Lan,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartHubOptions {
    pub entry_mode: DesktopEntryMode,
}

impl StartHubOptions {
    pub fn listen_host(&self) -> &'static str {
        match self.entry_mode {
            DesktopEntryMode::Local => LOCAL_LISTEN_HOST,
            DesktopEntryMode::Lan => LAN_LISTEN_HOST,
        }
    }
}

pub struct ManagedHubState {
    pub child: Option<Child>,
    pub last_error: Option<String>,
}

pub struct DesktopState {
    pub hub: Mutex<ManagedHubState>,
    pub quitting: AtomicBool,
}

impl Default for ManagedHubState {
    fn default() -> Self {
        Self {
            child: None,
            last_error: None,
        }
    }
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            hub: Mutex::new(ManagedHubState::default()),
            quitting: AtomicBool::new(false),
        }
    }
}

fn read_runtime_status() -> Result<Option<HubRuntimeStatus>, String> {
    let status_path = runtime_status_file_path()?;
    if !status_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(status_path).map_err(|error| error.to_string())?;
    let parsed =
        serde_json::from_str::<HubRuntimeStatus>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
}

fn default_startup_config() -> HubStartupConfig {
    HubStartupConfig {
        listen_host: DEFAULT_VIBY_LISTEN_HOST.to_string(),
        listen_port: DEFAULT_VIBY_LISTEN_PORT,
    }
}

fn parse_toml_string(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if !(trimmed.starts_with('"') && trimmed.ends_with('"')) {
        return Err(format!("Expected quoted TOML string, got: {trimmed}"));
    }

    serde_json::from_str(trimmed).map_err(|error| error.to_string())
}

fn parse_startup_config(raw: &str) -> Result<HubStartupConfig, String> {
    let mut config = default_startup_config();

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('[') {
            continue;
        }

        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };

        match key.trim() {
            "listen_host" => {
                let parsed = parse_toml_string(value)?;
                if !parsed.trim().is_empty() {
                    config.listen_host = parsed;
                }
            }
            "listen_port" => {
                let parsed = value
                    .trim()
                    .parse::<u16>()
                    .map_err(|error| format!("Invalid listen_port value: {error}"))?;
                if parsed == 0 {
                    return Err("listen_port must be greater than 0".to_string());
                }
                config.listen_port = parsed;
            }
            _ => {}
        }
    }

    Ok(config)
}

fn read_startup_config() -> Result<HubStartupConfig, String> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(default_startup_config());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    parse_startup_config(&raw)
}

fn is_pid_running(pid: u32) -> bool {
    let mut system = System::new();
    let target_pid = Pid::from_u32(pid);
    system.refresh_processes(ProcessesToUpdate::Some(&[target_pid]), false);
    system.process(target_pid).is_some()
}

fn wait_for_pid_exit(pid: u32) -> bool {
    for _ in 0..STOP_WAIT_ATTEMPTS {
        if !is_pid_running(pid) {
            return true;
        }
        sleep(STOP_WAIT_INTERVAL);
    }

    !is_pid_running(pid)
}

fn is_running_phase(status: &HubRuntimeStatus) -> bool {
    status.phase == "starting" || status.phase == "ready"
}

fn is_desktop_owned(status: &HubRuntimeStatus) -> bool {
    status.launch_source.as_deref() == Some("desktop")
}

fn is_desktop_owned_running(status: &HubRuntimeStatus) -> bool {
    is_desktop_owned(status) && is_running_phase(status)
}

fn send_signal(pid: u32, signal: Signal) -> bool {
    let mut system = System::new();
    let target_pid = Pid::from_u32(pid);
    system.refresh_processes(ProcessesToUpdate::Some(&[target_pid]), false);
    let Some(process) = system.process(target_pid) else {
        return false;
    };

    process.kill_with(signal).unwrap_or_else(|| process.kill())
}

fn stop_pid(pid: u32) -> Result<(), String> {
    if !is_pid_running(pid) {
        return Ok(());
    }

    let _ = send_signal(pid, Signal::Term);
    if wait_for_pid_exit(pid) {
        return Ok(());
    }

    let _ = send_signal(pid, Signal::Kill);
    if wait_for_pid_exit(pid) {
        return Ok(());
    }

    Err("等待中枢进程退出超时。".to_string())
}

fn normalize_runtime_status(status: HubRuntimeStatus) -> HubRuntimeStatus {
    if is_pid_running(status.pid) {
        return status;
    }

    HubRuntimeStatus {
        phase: "stopped".to_string(),
        message: Some("Hub 进程已经退出。".to_string()),
        ..status
    }
}

pub fn refresh_managed_child(process: &mut ManagedHubState) {
    let Some(child) = process.child.as_mut() else {
        return;
    };

    if let Ok(Some(_)) = child.try_wait() {
        process.child = None;
    }
}

pub fn build_snapshot(process: &mut ManagedHubState) -> Result<HubSnapshot, String> {
    refresh_managed_child(process);

    let startup_config = read_startup_config()?;
    let normalized_status = read_runtime_status()?.map(normalize_runtime_status);
    let visible_status = match normalized_status {
        Some(status) if process.child.is_some() || is_desktop_owned(&status) => Some(status),
        _ => None,
    };
    let log_path = desktop_log_file_path()?;
    let running = visible_status
        .as_ref()
        .map(is_running_phase)
        .unwrap_or(false);
    let desktop_owned_running = visible_status
        .as_ref()
        .is_some_and(is_desktop_owned_running);

    Ok(HubSnapshot {
        running,
        managed: process.child.is_some() || desktop_owned_running,
        last_error: process.last_error.clone(),
        log_path: log_path.display().to_string(),
        startup_config,
        status: visible_status,
    })
}

pub fn show_main_window(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Err("Main window is unavailable.".to_string());
    };

    #[cfg(target_os = "macos")]
    app.show().map_err(|error| error.to_string())?;
    let _ = window.unminimize();
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn open_preferred_url(state: &State<DesktopState>) -> Result<(), String> {
    let mut process = state
        .hub
        .lock()
        .map_err(|_| "Hub state is poisoned.".to_string())?;
    let snapshot = build_snapshot(&mut process)?;
    if !snapshot.running {
        return Err("当前中枢未运行，不能打开入口。".to_string());
    }
    let Some(status) = snapshot.status else {
        return Err("当前还没有可打开的网址。".to_string());
    };
    if status.phase != "ready" {
        return Err("中枢还没 ready，暂时不能打开入口。".to_string());
    }

    open::that(status.preferred_browser_url).map_err(|error| error.to_string())
}

pub fn stop_managed_hub(
    process: &mut ManagedHubState,
    status: Option<&HubRuntimeStatus>,
) -> Result<(), String> {
    if let Some(child) = process.child.as_mut() {
        let pid = child.id();
        let _ = child.try_wait();
        stop_pid(pid)?;
        process.child = None;
        process.last_error = None;
        return Ok(());
    }

    let Some(running_status) = status.filter(|current_status| is_running_phase(current_status))
    else {
        process.last_error = None;
        return Ok(());
    };
    if !is_desktop_owned(running_status) {
        process.last_error = None;
        return Ok(());
    }

    stop_pid(running_status.pid)?;
    process.last_error = None;
    Ok(())
}

#[cfg(test)]
#[path = "state_tests.rs"]
mod tests;
