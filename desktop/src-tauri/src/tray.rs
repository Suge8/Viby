use std::sync::atomic::Ordering;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, WindowEvent};

use crate::lifecycle::request_app_exit;
use crate::state::{show_main_window, DesktopState};

pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .icon({
            #[cfg(target_os = "macos")]
            {
                tauri::include_image!("./icons/tray-macos-template@2x.png")
            }
            #[cfg(not(target_os = "macos"))]
            {
                tauri::include_image!("./icons/tray-windows@2x.png")
            }
        })
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let app_handle = app.app_handle();
            match event.id().as_ref() {
                "show" => {
                    let _ = show_main_window(&app_handle);
                }
                "quit" => {
                    let _ = request_app_exit(&app_handle);
                }
                _ => {}
            }
        });

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    builder.build(app)?;

    Ok(())
}

fn should_hide_on_close(quitting: bool) -> bool {
    !quitting
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<DesktopState>();
        if !should_hide_on_close(state.quitting.load(Ordering::SeqCst)) {
            return;
        }
        api.prevent_close();
        #[cfg(target_os = "macos")]
        let _ = window.app_handle().hide();
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::should_hide_on_close;

    #[test]
    fn close_hides_window_unless_quitting() {
        assert!(should_hide_on_close(false));
        assert!(!should_hide_on_close(true));
    }
}
