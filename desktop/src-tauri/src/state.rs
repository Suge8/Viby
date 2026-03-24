use std::sync::atomic::AtomicBool;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

pub const HUB_SNAPSHOT_EVENT: &str = "desktop://hub-snapshot";
pub const DEFAULT_VIBY_LISTEN_HOST: &str = "127.0.0.1";
pub const DEFAULT_VIBY_LISTEN_PORT: u16 = 37173;
pub const LAN_LISTEN_HOST: &str = "0.0.0.0";
pub const LOCAL_LISTEN_HOST: &str = "127.0.0.1";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HubStartupConfig {
    pub listen_host: String,
    pub listen_port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HubRuntimePhase {
    Starting,
    Ready,
    Stopped,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HubLaunchSource {
    Desktop,
    Cli,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HubRuntimeStatus {
    pub phase: HubRuntimePhase,
    pub pid: u32,
    pub launch_source: Option<HubLaunchSource>,
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

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
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
    pub managed_pid: Option<u32>,
    pub last_error: Option<String>,
    pub last_snapshot: Option<HubSnapshot>,
}

pub struct DesktopState {
    pub hub: Mutex<ManagedHubState>,
    pub quitting: AtomicBool,
}

impl Default for ManagedHubState {
    fn default() -> Self {
        Self {
            managed_pid: None,
            last_error: None,
            last_snapshot: None,
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
