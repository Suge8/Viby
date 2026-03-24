use std::fs;
use std::thread::sleep;
use std::time::Duration;

use serde::Deserialize;
use sysinfo::{Pid, ProcessesToUpdate, Signal, System};

use crate::launch::{desktop_log_file_path, runtime_status_file_path, settings_file_path};
use crate::state::{
    HubLaunchSource, HubRuntimePhase, HubRuntimeStatus, HubSnapshot, HubStartupConfig,
    ManagedHubState, DEFAULT_VIBY_LISTEN_HOST, DEFAULT_VIBY_LISTEN_PORT,
};

const STOP_WAIT_INTERVAL: Duration = Duration::from_millis(100);
const STOP_WAIT_ATTEMPTS: usize = 20;

#[derive(Debug, Deserialize)]
struct SettingsFile {
    listen_host: Option<String>,
    listen_port: Option<u16>,
}

pub(crate) fn default_startup_config() -> HubStartupConfig {
    HubStartupConfig {
        listen_host: DEFAULT_VIBY_LISTEN_HOST.to_string(),
        listen_port: DEFAULT_VIBY_LISTEN_PORT,
    }
}

fn read_runtime_status() -> Result<Option<HubRuntimeStatus>, String> {
    let status_path = runtime_status_file_path()?;
    if !status_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(status_path).map_err(|error| error.to_string())?;
    let parsed = serde_json::from_str::<HubRuntimeStatus>(&raw).map_err(|error| error.to_string())?;
    Ok(Some(parsed))
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
    matches!(status.phase, HubRuntimePhase::Starting | HubRuntimePhase::Ready)
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

pub fn build_snapshot(process: &mut ManagedHubState) -> Result<HubSnapshot, String> {
    let startup_config = read_startup_config()?;
    let normalized_status = read_runtime_status()?.map(normalize_runtime_status);
    let visible_status = match normalized_status {
        Some(status) if process.managed_pid.is_some() || is_desktop_owned(&status) => Some(status),
        _ => None,
    };
    let log_path = desktop_log_file_path()?;
    let running = visible_status.as_ref().is_some_and(is_running_phase);
    let desktop_owned_running = visible_status.as_ref().is_some_and(is_desktop_owned_running);

    Ok(HubSnapshot {
        running,
        managed: process.managed_pid.is_some() || desktop_owned_running,
        last_error: process.last_error.clone(),
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

    let Some(running_status) = status.filter(|current_status| is_running_phase(current_status)) else {
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
