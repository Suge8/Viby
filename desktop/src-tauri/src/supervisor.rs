use std::fs;
use std::path::Path;
use std::process::{Child, ChildStdin, ExitStatus};
use std::sync::mpsc::channel;
use std::thread;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::launch::{
    resolve_shared_viby_home_dir, runtime_status_file_path, settings_file_path,
    spawn_app_core_process,
};
use crate::settings;
use crate::snapshot::{build_snapshot, stop_managed_hub};
use crate::state::{DesktopState, HubSnapshot, ManagedHubState, HUB_SNAPSHOT_EVENT};

struct SnapshotUpdate {
    snapshot: HubSnapshot,
    changed: bool,
}

fn update_snapshot(process: &mut ManagedHubState) -> Result<SnapshotUpdate, String> {
    let snapshot = build_snapshot(process)?;
    let changed = process.last_snapshot.as_ref() != Some(&snapshot);
    process.last_snapshot = Some(snapshot.clone());

    Ok(SnapshotUpdate { snapshot, changed })
}

fn emit_refresh_result(app: &AppHandle) {
    let _ = refresh_snapshot(app);
}

fn with_hub_state<T>(
    app: &AppHandle,
    action: impl FnOnce(&mut ManagedHubState) -> Result<T, String>,
) -> Result<T, String> {
    let state = app.state::<DesktopState>();
    let mut process = state
        .hub
        .lock()
        .map_err(|_| "Hub state is poisoned.".to_string())?;
    action(&mut process)
}

fn emit_snapshot(app: &AppHandle, snapshot: &HubSnapshot) -> Result<(), String> {
    app.emit(HUB_SNAPSHOT_EVENT, snapshot)
        .map_err(|error| error.to_string())
}

fn emit_if_changed(app: &AppHandle, update: &SnapshotUpdate) -> Result<(), String> {
    if update.changed {
        emit_snapshot(app, &update.snapshot)?;
    }

    Ok(())
}

pub fn refresh_snapshot(app: &AppHandle) -> Result<HubSnapshot, String> {
    let update = with_hub_state(app, update_snapshot)?;
    emit_if_changed(app, &update)?;
    Ok(update.snapshot)
}

fn take_desktop_parent_pipe_guard(child: &mut Child) -> Option<ChildStdin> {
    child.stdin.take()
}

fn wait_for_managed_child_exit(mut child: Child) -> std::io::Result<ExitStatus> {
    let _parent_pipe_guard = take_desktop_parent_pipe_guard(&mut child);
    child.wait()
}

fn describe_child_exit(result: &std::io::Result<ExitStatus>) -> Option<String> {
    match result {
        Ok(status) if status.success() => None,
        Ok(status) => Some(format!("AppCore process exited: {status}")),
        Err(error) => Some(format!("Failed to wait for AppCore process: {error}")),
    }
}

fn watch_managed_child(app: AppHandle, child: Child) {
    let pid = child.id();
    thread::spawn(move || {
        let exit_result = wait_for_managed_child_exit(child);
        let exit_error = describe_child_exit(&exit_result);
        let _ = with_hub_state(&app, |process| {
            if process.managed_pid == Some(pid) {
                process.managed_pid = None;
                process.last_error = exit_error;
            }
            Ok(())
        });
        emit_refresh_result(&app);
    });
}

fn is_state_path(path: &Path, runtime_status_path: &Path, settings_path: &Path) -> bool {
    path == runtime_status_path || path == settings_path
}

fn should_refresh_for_event(
    event: &Event,
    runtime_status_path: &Path,
    settings_path: &Path,
) -> bool {
    event
        .paths
        .iter()
        .any(|path| is_state_path(path, runtime_status_path, settings_path))
}

fn watch_state_files(app: AppHandle) -> Result<(), String> {
    let watch_dir = resolve_shared_viby_home_dir()?;
    fs::create_dir_all(&watch_dir).map_err(|error| error.to_string())?;
    let runtime_status_path = runtime_status_file_path()?;
    let settings_path = settings_file_path()?;

    let (tx, rx) = channel::<notify::Result<Event>>();
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(event);
    })
    .map_err(|error| error.to_string())?;
    watcher
        .watch(&watch_dir, RecursiveMode::NonRecursive)
        .map_err(|error| error.to_string())?;

    thread::spawn(move || {
        let _watcher = watcher;
        while let Ok(event_result) = rx.recv() {
            let Ok(event) = event_result else {
                continue;
            };

            if should_refresh_for_event(&event, &runtime_status_path, &settings_path) {
                emit_refresh_result(&app);
            }
        }
    });

    Ok(())
}

pub fn get_hub_snapshot(app: &AppHandle) -> Result<HubSnapshot, String> {
    refresh_snapshot(app)
}

pub fn start_hub(app: &AppHandle) -> Result<HubSnapshot, String> {
    let mut spawned_child: Option<Child> = None;
    let update = with_hub_state(app, |process| {
        let existing_snapshot = build_snapshot(process)?;
        if existing_snapshot.running {
            process.last_error = None;
            return update_snapshot(process);
        }

        if process.managed_pid.is_none() {
            let child = match spawn_app_core_process(app, &existing_snapshot.startup_config) {
                Ok(child) => child,
                Err(error) => {
                    process.last_error = Some(error.clone());
                    return update_snapshot(process).and_then(|update| {
                        process.last_snapshot = Some(update.snapshot.clone());
                        Err(error)
                    });
                }
            };
            process.managed_pid = Some(child.id());
            spawned_child = Some(child);
            process.last_error = None;
        }

        update_snapshot(process)
    });

    match update {
        Ok(update) => {
            if let Some(child) = spawned_child {
                watch_managed_child(app.clone(), child);
            }
            emit_if_changed(app, &update)?;
            Ok(update.snapshot)
        }
        Err(error) => {
            if let Ok(snapshot) = refresh_snapshot(app) {
                let _ = emit_snapshot(app, &snapshot);
            }
            Err(error)
        }
    }
}

pub fn stop_hub(app: &AppHandle) -> Result<HubSnapshot, String> {
    let update = with_hub_state(app, |process| {
        let snapshot = build_snapshot(process)?;
        stop_managed_hub(process, snapshot.status.as_ref())?;
        update_snapshot(process)
    })?;

    emit_if_changed(app, &update)?;
    Ok(update.snapshot)
}

fn hub_supports_public_access_hot_reload(snapshot: &HubSnapshot) -> bool {
    snapshot
        .status
        .as_ref()
        .is_some_and(|status| status.public_access_hot_reload)
}

pub fn set_public_access_enabled(app: &AppHandle, enabled: bool) -> Result<HubSnapshot, String> {
    let mut spawned_child: Option<Child> = None;
    let update = with_hub_state(app, |process| {
        let before = build_snapshot(process)?;
        if before.startup_config.public_access_enabled == enabled {
            process.last_error = None;
            return update_snapshot(process);
        }

        // settings.toml is the single source of truth. A current Hub watches the file and
        // hot-reloads the public access policy without dropping connections.
        settings::write_public_access_enabled(enabled)?;

        // Upgrade-window fallback: a reused older Hub cannot hot-reload, so restart it once.
        // Current Hub builds advertise `public_access_hot_reload` and skip this branch.
        if before.running && !hub_supports_public_access_hot_reload(&before) {
            stop_managed_hub(process, before.status.as_ref())?;
            let next = build_snapshot(process)?;
            let child = match spawn_app_core_process(app, &next.startup_config) {
                Ok(child) => child,
                Err(error) => {
                    process.last_error = Some(error.clone());
                    return update_snapshot(process).and_then(|update| {
                        process.last_snapshot = Some(update.snapshot.clone());
                        Err(error)
                    });
                }
            };
            process.managed_pid = Some(child.id());
            spawned_child = Some(child);
        }

        process.last_error = None;
        update_snapshot(process)
    });

    match update {
        Ok(update) => {
            if let Some(child) = spawned_child {
                watch_managed_child(app.clone(), child);
            }
            emit_if_changed(app, &update)?;
            Ok(update.snapshot)
        }
        Err(error) => {
            if let Ok(snapshot) = refresh_snapshot(app) {
                let _ = emit_snapshot(app, &snapshot);
            }
            Err(error)
        }
    }
}

pub fn open_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed != url || !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("只能打开 HTTP/HTTPS 入口地址。".to_string());
    }

    open::that(trimmed).map_err(|error| error.to_string())
}

pub fn start_snapshot_supervisor(app: AppHandle) -> Result<(), String> {
    let _ = refresh_snapshot(&app)?;
    watch_state_files(app)?;
    Ok(())
}

#[cfg(test)]
#[path = "supervisor_tests.rs"]
mod tests;
