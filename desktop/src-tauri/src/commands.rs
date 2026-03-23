use arboard::Clipboard;
use tauri::{AppHandle, State};

use crate::launch::spawn_hub_process;
use crate::state::{
    build_snapshot, refresh_managed_child, stop_managed_hub, DesktopState, HubSnapshot,
    StartHubOptions,
};

#[tauri::command]
pub fn get_hub_snapshot(state: State<DesktopState>) -> Result<HubSnapshot, String> {
    let mut process = state
        .hub
        .lock()
        .map_err(|_| "Hub state is poisoned.".to_string())?;
    build_snapshot(&mut process)
}

#[tauri::command]
pub fn start_hub(
    app: AppHandle,
    state: State<DesktopState>,
    options: StartHubOptions,
) -> Result<HubSnapshot, String> {
    let mut process = state
        .hub
        .lock()
        .map_err(|_| "Hub state is poisoned.".to_string())?;
    refresh_managed_child(&mut process);
    let existing_snapshot = build_snapshot(&mut process)?;
    if existing_snapshot.running {
        process.last_error = None;
        return Ok(existing_snapshot);
    }

    if process.child.is_none() {
        let child = match spawn_hub_process(&app, &options) {
            Ok(child) => child,
            Err(error) => {
                process.last_error = Some(error.clone());
                return Err(error);
            }
        };
        process.child = Some(child);
        process.last_error = None;
    }

    build_snapshot(&mut process)
}

#[tauri::command]
pub fn stop_hub(state: State<DesktopState>) -> Result<HubSnapshot, String> {
    let mut process = state
        .hub
        .lock()
        .map_err(|_| "Hub state is poisoned.".to_string())?;
    let snapshot = build_snapshot(&mut process)?;
    stop_managed_hub(&mut process, snapshot.status.as_ref())?;
    build_snapshot(&mut process)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())
}
