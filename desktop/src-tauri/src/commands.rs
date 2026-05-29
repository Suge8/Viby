use arboard::Clipboard;
use tauri::AppHandle;

use tauri::State;

use crate::lan_pairing;
use crate::pairing;
use crate::pairing_events::{spawn_pairing_event_stream, PairingEventsState};
use crate::state::{DesktopLanPairingSession, DesktopPairingSession, HubSnapshot};
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
pub async fn start_hub(app: AppHandle) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::start_hub(&app)).await
}

#[tauri::command]
pub async fn stop_hub(app: AppHandle) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::stop_hub(&app)).await
}

#[tauri::command]
pub async fn open_url(url: String) -> Result<(), String> {
    run_blocking(move || supervisor::open_url(&url)).await
}

#[tauri::command]
pub fn copy_text(text: String) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|error| error.to_string())?;
    clipboard.set_text(text).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn set_public_access_enabled(
    app: AppHandle,
    enabled: bool,
) -> Result<HubSnapshot, String> {
    run_blocking(move || supervisor::set_public_access_enabled(&app, enabled)).await
}

#[tauri::command]
pub async fn get_pairing_sessions() -> Result<Vec<DesktopPairingSession>, String> {
    run_blocking(pairing::read_pairing_sessions).await
}

#[tauri::command]
pub async fn clear_pairing_sessions() -> Result<(), String> {
    run_blocking(pairing::clear_pairing_sessions).await
}

#[tauri::command]
pub async fn remove_pairing_session(pairing_id: String) -> Result<(), String> {
    run_blocking(move || pairing::remove_pairing_session(&pairing_id)).await
}

#[tauri::command]
pub async fn create_pairing_session(app: AppHandle) -> Result<DesktopPairingSession, String> {
    run_blocking(move || pairing::create_pairing_session(&app)).await
}

#[tauri::command]
pub async fn refresh_pairing_session(
    pairing: DesktopPairingSession,
) -> Result<DesktopPairingSession, String> {
    run_blocking(move || pairing::refresh_pairing_session(pairing)).await
}

#[tauri::command]
pub async fn delete_pairing_session(pairing: DesktopPairingSession) -> Result<(), String> {
    run_blocking(move || pairing::delete_pairing_session(pairing)).await
}

#[tauri::command]
pub async fn create_lan_pairing_session(
    app: AppHandle,
    invite_base_url: String,
) -> Result<DesktopLanPairingSession, String> {
    run_blocking(move || lan_pairing::create_lan_pairing_session(&app, invite_base_url)).await
}

#[tauri::command]
pub async fn refresh_lan_pairing_session(
    app: AppHandle,
    pairing: DesktopLanPairingSession,
) -> Result<DesktopLanPairingSession, String> {
    run_blocking(move || lan_pairing::refresh_lan_pairing_session(&app, pairing)).await
}

#[tauri::command]
pub async fn delete_lan_pairing_session(
    app: AppHandle,
    pairing: DesktopLanPairingSession,
) -> Result<(), String> {
    run_blocking(move || lan_pairing::delete_lan_pairing_session(&app, pairing)).await
}

#[tauri::command]
pub fn subscribe_pairing_events(
    app: AppHandle,
    events: State<'_, PairingEventsState>,
    pairing_id: String,
    events_url: String,
) -> Result<(), String> {
    spawn_pairing_event_stream(app, events.inner(), pairing_id, events_url);
    Ok(())
}

#[tauri::command]
pub fn unsubscribe_pairing_events(
    events: State<'_, PairingEventsState>,
    pairing_id: String,
) -> Result<(), String> {
    events.cancel(&pairing_id);
    Ok(())
}
