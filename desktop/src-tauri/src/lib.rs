mod commands;
mod launch;
mod lifecycle;
mod state;
mod tray;

use state::DesktopState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = state::show_main_window(app);
        }))
        .manage(DesktopState::default())
        .setup(|app| {
            tray::create_tray(app.handle())?;
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
            commands::copy_text
        ])
        .build(tauri::generate_context!())
        .expect("error while building viby desktop");

    app.run(|app_handle, event| {
        lifecycle::handle_run_event(app_handle, &event);
    });
}
