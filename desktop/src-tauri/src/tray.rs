use std::sync::atomic::Ordering;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};

use crate::lifecycle::request_app_exit;
use crate::state::{open_preferred_url, show_main_window, DesktopState};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示 Viby", true, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open", "打开入口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &open_item, &quit_item])?;

    TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let app_handle = app.app_handle();
            match event.id().as_ref() {
                "show" => {
                    let _ = show_main_window(&app_handle);
                }
                "open" => {
                    let state = app_handle.state::<DesktopState>();
                    let _ = open_preferred_url(&state);
                }
                "quit" => {
                    let _ = request_app_exit(&app_handle);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<DesktopState>();
        if state.quitting.load(Ordering::SeqCst) {
            return;
        }
        api.prevent_close();
        #[cfg(target_os = "macos")]
        let _ = window.app_handle().hide();
        let _ = window.hide();
    }
}
