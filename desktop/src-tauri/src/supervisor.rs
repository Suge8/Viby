use std::fs;
use std::path::Path;
use std::process::Child;
use std::sync::mpsc::channel;
use std::thread;

use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::launch::{
    resolve_shared_viby_home_dir, runtime_status_file_path, settings_file_path, spawn_hub_process,
};
use crate::snapshot::{build_snapshot, stop_managed_hub};
use crate::state::{
    DesktopState, HubRuntimePhase, HubSnapshot, ManagedHubState, StartHubOptions, HUB_SNAPSHOT_EVENT,
};

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

fn watch_managed_child(app: AppHandle, mut child: Child) {
    let pid = child.id();
    thread::spawn(move || {
        let _ = child.wait();
        let _ = with_hub_state(&app, |process| {
            if process.managed_pid == Some(pid) {
                process.managed_pid = None;
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

pub fn start_hub(app: &AppHandle, options: StartHubOptions) -> Result<HubSnapshot, String> {
    let mut spawned_child: Option<Child> = None;
    let update = with_hub_state(app, |process| {
        let existing_snapshot = build_snapshot(process)?;
        if existing_snapshot.running {
            process.last_error = None;
            return update_snapshot(process);
        }

        if process.managed_pid.is_none() {
            let child = match spawn_hub_process(app, &options) {
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

pub fn open_preferred_url(app: &AppHandle) -> Result<(), String> {
    let snapshot = refresh_snapshot(app)?;
    if !snapshot.running {
        return Err("当前中枢未运行，不能打开入口。".to_string());
    }
    let Some(status) = snapshot.status else {
        return Err("当前还没有可打开的网址。".to_string());
    };
    if status.phase != HubRuntimePhase::Ready {
        return Err("中枢还没 ready，暂时不能打开入口。".to_string());
    }

    open::that(status.preferred_browser_url).map_err(|error| error.to_string())
}

pub fn start_snapshot_supervisor(app: AppHandle) -> Result<(), String> {
    let _ = refresh_snapshot(&app)?;
    watch_state_files(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use notify::{event::CreateKind, Event, EventKind};

    use super::should_refresh_for_event;

    fn make_event(paths: Vec<PathBuf>) -> Event {
        Event {
            kind: EventKind::Create(CreateKind::File),
            paths,
            attrs: Default::default(),
        }
    }

    #[test]
    fn refreshes_for_runtime_status_events() {
        let runtime_status_path = PathBuf::from("/tmp/hub.runtime-status.json");
        let settings_path = PathBuf::from("/tmp/settings.toml");

        assert!(should_refresh_for_event(
            &make_event(vec![runtime_status_path.clone()]),
            &runtime_status_path,
            &settings_path,
        ));
    }

    #[test]
    fn refreshes_for_settings_events() {
        let runtime_status_path = PathBuf::from("/tmp/hub.runtime-status.json");
        let settings_path = PathBuf::from("/tmp/settings.toml");

        assert!(should_refresh_for_event(
            &make_event(vec![settings_path.clone()]),
            &runtime_status_path,
            &settings_path,
        ));
    }

    #[test]
    fn ignores_unrelated_events() {
        let runtime_status_path = PathBuf::from("/tmp/hub.runtime-status.json");
        let settings_path = PathBuf::from("/tmp/settings.toml");

        assert!(!should_refresh_for_event(
            &make_event(vec![PathBuf::from("/tmp/other.txt")]),
            &runtime_status_path,
            &settings_path,
        ));
    }
}
