use arboard::Clipboard;
use tauri::AppHandle;

use crate::pairing;
use crate::state::{DesktopPairingSession, HubSnapshot, StartHubOptions};
use crate::supervisor;

async fn run_blocking<T>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String>
where
    T: Send + 'static,
{
    tokio::task::spawn_blocking(job)
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_hub_snapshot(app: AppHandle) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::get_hub_snapshot(&app)).await
}

#[tauri::command]
pub async fn start_hub(
    app: AppHandle,
    options: StartHubOptions,
) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::start_hub(&app, options)).await
}

#[tauri::command]
pub async fn stop_hub(app: AppHandle) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::stop_hub(&app)).await
}

#[tauri::command]
pub async fn open_preferred_url(app: AppHandle) -> Result<(), String> {
    run_blocking(move || supervisor::open_preferred_url(&app)).await
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn create_pairing_session(app: AppHandle) -> Result<DesktopPairingSession, String> {
    run_blocking(move || pairing::create_pairing_session(&app)).await
}

#[tauri::command]
pub async fn approve_pairing_session(
    pairing: DesktopPairingSession,
) -> Result<DesktopPairingSession, String> {
    run_blocking(move || pairing::approve_pairing_session(pairing)).await
}

#[tauri::command]
pub async fn delete_pairing_session(pairing: DesktopPairingSession) -> Result<(), String> {
    run_blocking(move || pairing::delete_pairing_session(pairing)).await
}
