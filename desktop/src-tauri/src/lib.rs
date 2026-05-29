mod commands;
mod lan_pairing;
mod launch;
mod lifecycle;
mod pairing;
mod pairing_events;
mod pairing_storage;
mod settings;
mod snapshot;
mod state;
mod supervisor;
mod tray;

use pairing_events::PairingEventsState;
use state::DesktopState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = state::show_main_window(app);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(DesktopState::default())
        .manage(PairingEventsState::default())
        .setup(|app| {
            tray::create_tray(app.handle())?;
            supervisor::start_snapshot_supervisor(app.handle().clone())
                .map_err(|error| -> Box<dyn std::error::Error> { error.into() })?;
            Ok(())
        })
        .on_window_event(|window, event| {
            tray::handle_window_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_hub_snapshot,
            commands::start_hub,
            commands::stop_hub,
            commands::open_url,
            commands::copy_text,
            commands::set_public_access_enabled,
            commands::get_pairing_sessions,
            commands::clear_pairing_sessions,
            commands::remove_pairing_session,
            commands::create_pairing_session,
            commands::refresh_pairing_session,
            commands::delete_pairing_session,
            commands::create_lan_pairing_session,
            commands::refresh_lan_pairing_session,
            commands::delete_lan_pairing_session,
            commands::subscribe_pairing_events,
            commands::unsubscribe_pairing_events
        ])
        .build(tauri::generate_context!())
        .expect("error while building viby desktop");

    app.run(|app_handle, event| {
        lifecycle::handle_run_event(app_handle, &event);
    });
}
