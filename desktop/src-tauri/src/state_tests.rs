use std::process::{Child, Command};

use crate::snapshot::{
    default_startup_config, is_desktop_owned_running, is_pid_running, stop_managed_hub,
};
use crate::state::{
    HubLaunchSource, HubRuntimePhase, HubRuntimeStatus, ManagedHubState, DEFAULT_VIBY_LISTEN_HOST,
};

fn parse_startup_config(raw: &str) -> Result<crate::state::HubStartupConfig, String> {
    let parsed = toml::from_str::<toml::Table>(raw).map_err(|error| error.to_string())?;
    let mut config = default_startup_config();

    if let Some(listen_host) = parsed.get("listen_host").and_then(|value| value.as_str()) {
        config.listen_host = listen_host.to_string();
    }

    if let Some(listen_port) = parsed.get("listen_port").and_then(|value| value.as_integer()) {
        config.listen_port = listen_port as u16;
    }

    Ok(config)
}

fn spawn_waiting_process() -> Child {
    #[cfg(unix)]
    {
        return Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("failed to spawn sleep");
    }

    #[cfg(windows)]
    {
        return Command::new("cmd")
            .args(["/C", "ping -n 30 127.0.0.1 > NUL"])
            .spawn()
            .expect("failed to spawn wait command");
    }
}

fn kill_child_if_running(child: &mut Child) {
    if child.try_wait().ok().flatten().is_none() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn make_status(pid: u32, launch_source: Option<&str>) -> HubRuntimeStatus {
    HubRuntimeStatus {
        phase: HubRuntimePhase::Ready,
        pid,
        launch_source: launch_source.map(|value| match value {
            "desktop" => HubLaunchSource::Desktop,
            _ => HubLaunchSource::Cli,
        }),
        listen_host: DEFAULT_VIBY_LISTEN_HOST.to_string(),
        listen_port: 3006,
        local_hub_url: "http://127.0.0.1:3006".to_string(),
        preferred_browser_url: "http://127.0.0.1:3006".to_string(),
        cli_api_token: "token".to_string(),
        settings_file: "/tmp/settings.toml".to_string(),
        data_dir: "/tmp".to_string(),
        started_at: "2026-03-20T00:00:00.000Z".to_string(),
        updated_at: "2026-03-20T00:00:00.000Z".to_string(),
        public_hub_url: None,
        direct_access_url: None,
        message: None,
    }
}

#[test]
fn stop_managed_hub_kills_tracked_child() {
    let child = spawn_waiting_process();
    let pid = child.id();
    let mut owned_child = child;
    let mut process = ManagedHubState {
        managed_pid: Some(pid),
        last_error: Some("old".to_string()),
        last_snapshot: None,
    };

    stop_managed_hub(&mut process, None).expect("stop should succeed");

    assert!(process.managed_pid.is_none());
    assert!(process.last_error.is_none());
    assert!(!is_pid_running(pid));

    kill_child_if_running(&mut owned_child);
}

#[test]
fn stop_managed_hub_does_not_kill_external_pid() {
    let mut child = spawn_waiting_process();
    let pid = child.id();
    let status = make_status(pid, Some("cli"));
    let mut process = ManagedHubState::default();

    stop_managed_hub(&mut process, Some(&status)).expect("stop should not fail");

    assert!(is_pid_running(pid));

    kill_child_if_running(&mut child);
}

#[test]
fn stop_managed_hub_kills_desktop_owned_status_pid() {
    let mut child = spawn_waiting_process();
    let pid = child.id();
    let status = make_status(pid, Some("desktop"));
    let mut process = ManagedHubState::default();

    stop_managed_hub(&mut process, Some(&status)).expect("stop should succeed");

    assert!(!is_pid_running(pid));

    kill_child_if_running(&mut child);
}

#[test]
fn desktop_owned_running_ignores_stopped_status() {
    let mut status = make_status(std::process::id(), Some("desktop"));
    status.phase = HubRuntimePhase::Stopped;

    assert!(!is_desktop_owned_running(&status));
}

#[test]
fn parse_startup_config_reads_listen_host_and_port() {
    let config = parse_startup_config(
        r#"
        listen_host = "0.0.0.0"
        listen_port = 4123
        "#,
    )
    .expect("config should parse");

    assert_eq!(config.listen_host, "0.0.0.0");
    assert_eq!(config.listen_port, 4123);
}

#[test]
fn parse_startup_config_falls_back_to_defaults_when_keys_are_missing() {
    let config = parse_startup_config(
        r#"
        cli_api_token = "token"
        "#,
    )
    .expect("config should parse");
    let default_config = default_startup_config();

    assert_eq!(config.listen_host, default_config.listen_host);
    assert_eq!(config.listen_port, default_config.listen_port);
}
