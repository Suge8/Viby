use std::fs;
use std::path::Path;
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use sysinfo::{Pid, ProcessesToUpdate, Signal, System};

use crate::launch::{desktop_log_file_path, runtime_status_file_path, settings_file_path};
use crate::state::{
    HubLaunchSource, HubRuntimePhase, HubRuntimeStatus, HubSnapshot, HubStartupConfig,
    ManagedHubState, DEFAULT_VIBY_LISTEN_HOST, DEFAULT_VIBY_LISTEN_PORT,
};

const STOP_WAIT_INTERVAL: Duration = Duration::from_millis(100);
const STOP_WAIT_ATTEMPTS: usize = 20;
const LOCALHOST_LISTEN_HOST: &str = "127.0.0.1";
const ALL_IPV4_LISTEN_HOST: &str = "0.0.0.0";
const ALL_IPV6_LISTEN_HOST: &str = "::";
const STARTING_MESSAGE: &str = "Hub process is launching.";

#[derive(Debug, Deserialize)]
struct SettingsFile {
    listen_host: Option<String>,
    listen_port: Option<u16>,
    public_access_enabled: Option<bool>,
}

pub(crate) struct RuntimeStatusRead {
    pub status: Option<HubRuntimeStatus>,
    pub warning: Option<String>,
}

pub(crate) fn default_startup_config() -> HubStartupConfig {
    HubStartupConfig {
        listen_host: DEFAULT_VIBY_LISTEN_HOST.to_string(),
        listen_port: DEFAULT_VIBY_LISTEN_PORT,
        public_access_enabled: true,
    }
}

fn clear_invalid_runtime_status(
    path: &Path,
    source: &str,
    error: impl ToString,
) -> RuntimeStatusRead {
    let reason = error.to_string();
    match fs::remove_file(path) {
        Ok(()) => RuntimeStatusRead {
            status: None,
            warning: Some(format!("已清理无效中枢状态文件 {source}: {reason}")),
        },
        Err(remove_error) => RuntimeStatusRead {
            status: None,
            warning: Some(format!(
                "忽略无效中枢状态文件 {source}: {reason}; 清理失败: {remove_error}"
            )),
        },
    }
}

pub(crate) fn read_runtime_status_from_path(status_path: &Path) -> RuntimeStatusRead {
    if !status_path.exists() {
        return RuntimeStatusRead {
            status: None,
            warning: None,
        };
    }

    let source = status_path.display().to_string();
    let raw = match fs::read_to_string(&status_path) {
        Ok(value) => value,
        Err(error) => {
            return RuntimeStatusRead {
                status: None,
                warning: Some(format!("无法读取中枢状态文件 {source}: {error}")),
            };
        }
    };
    match serde_json::from_str::<HubRuntimeStatus>(&raw) {
        Ok(status) => RuntimeStatusRead {
            status: Some(status),
            warning: None,
        },
        Err(error) => clear_invalid_runtime_status(status_path, &source, error),
    }
}

fn read_runtime_status() -> Result<RuntimeStatusRead, String> {
    let status_path = runtime_status_file_path()?;
    Ok(read_runtime_status_from_path(&status_path))
}

fn read_startup_config() -> Result<HubStartupConfig, String> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(default_startup_config());
    }

    let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let parsed = toml::from_str::<SettingsFile>(&raw).map_err(|error| error.to_string())?;
    let mut config = default_startup_config();

    if let Some(listen_host) = parsed.listen_host.filter(|value| !value.trim().is_empty()) {
        config.listen_host = listen_host;
    }

    if let Some(listen_port) = parsed.listen_port {
        if listen_port == 0 {
            return Err("listen_port must be greater than 0".to_string());
        }
        config.listen_port = listen_port;
    }

    if let Some(public_access_enabled) = parsed.public_access_enabled {
        config.public_access_enabled = public_access_enabled;
    }

    Ok(config)
}

pub(crate) fn is_pid_running(pid: u32) -> bool {
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
    matches!(
        status.phase,
        HubRuntimePhase::Starting | HubRuntimePhase::Ready
    )
}

fn is_desktop_owned(status: &HubRuntimeStatus) -> bool {
    status.launch_source == Some(HubLaunchSource::Desktop)
}

pub(crate) fn is_desktop_owned_running(status: &HubRuntimeStatus) -> bool {
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
        phase: HubRuntimePhase::Stopped,
        message: Some("Hub 进程已经退出。".to_string()),
        ..status
    }
}

fn format_runtime_url(listen_host: &str, listen_port: u16) -> String {
    let host = match listen_host {
        ALL_IPV4_LISTEN_HOST | ALL_IPV6_LISTEN_HOST => LOCALHOST_LISTEN_HOST,
        value => value,
    };
    let formatted_host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };

    format!("http://{formatted_host}:{listen_port}")
}

fn current_timestamp() -> String {
    match SystemTime::now().duration_since(UNIX_EPOCH) {
        Ok(duration) => format!(
            "unix:{}.{:03}",
            duration.as_secs(),
            duration.subsec_millis()
        ),
        Err(_) => "unix:0.000".to_string(),
    }
}

fn build_launching_status(
    pid: u32,
    startup_config: &HubStartupConfig,
) -> Result<HubRuntimeStatus, String> {
    let timestamp = current_timestamp();
    let data_dir = crate::launch::resolve_shared_viby_home_dir()?;
    let settings_file = settings_file_path()?;
    let local_hub_url = format_runtime_url(&startup_config.listen_host, startup_config.listen_port);

    Ok(HubRuntimeStatus {
        phase: HubRuntimePhase::Starting,
        pid,
        launch_source: Some(HubLaunchSource::Desktop),
        listen_host: startup_config.listen_host.clone(),
        listen_port: startup_config.listen_port,
        local_hub_url: local_hub_url.clone(),
        preferred_browser_url: local_hub_url.clone(),
        public_url: local_hub_url,
        public_access_enabled: startup_config.public_access_enabled,
        // Desktop only spawns the bundled (current) Hub, which always hot-reloads.
        public_access_hot_reload: true,
        pairing_broker_url: None,
        hub_owner_token: String::new(),
        settings_file: settings_file.display().to_string(),
        data_dir: data_dir.display().to_string(),
        started_at: timestamp.clone(),
        updated_at: timestamp,
        message: Some(STARTING_MESSAGE.to_string()),
    })
}

pub(crate) fn resolve_visible_status(
    managed_pid: Option<u32>,
    normalized_status: Option<HubRuntimeStatus>,
    startup_config: &HubStartupConfig,
) -> Result<Option<HubRuntimeStatus>, String> {
    let Some(pid) = managed_pid else {
        return Ok(normalized_status.filter(is_desktop_owned));
    };

    if let Some(status) = normalized_status.filter(|status| status.pid == pid) {
        if status.phase != HubRuntimePhase::Stopped || !is_pid_running(pid) {
            return Ok(Some(status));
        }
    }

    if is_pid_running(pid) {
        return build_launching_status(pid, startup_config).map(Some);
    }

    Ok(None)
}

pub fn build_snapshot(process: &mut ManagedHubState) -> Result<HubSnapshot, String> {
    let startup_config = read_startup_config()?;
    let runtime_status = read_runtime_status()?;
    let visible_status = resolve_visible_status(
        process.managed_pid,
        runtime_status.status.map(normalize_runtime_status),
        &startup_config,
    )?;
    let log_path = desktop_log_file_path()?;
    let running = visible_status.as_ref().is_some_and(is_running_phase);
    let desktop_owned_running = visible_status
        .as_ref()
        .is_some_and(is_desktop_owned_running);

    Ok(HubSnapshot {
        running,
        managed: process.managed_pid.is_some() || desktop_owned_running,
        last_error: process.last_error.clone().or(runtime_status.warning),
        log_path: log_path.display().to_string(),
        startup_config,
        status: visible_status,
    })
}

pub fn stop_managed_hub(
    process: &mut ManagedHubState,
    status: Option<&HubRuntimeStatus>,
) -> Result<(), String> {
    if let Some(pid) = process.managed_pid {
        stop_pid(pid)?;
        process.managed_pid = None;
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
