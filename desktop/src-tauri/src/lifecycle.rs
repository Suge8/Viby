use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager, RunEvent};

use crate::state::{show_main_window, DesktopState};
use crate::supervisor;

fn attempt_quit(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<DesktopState>();
    if state.quitting.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    if let Err(error) = supervisor::stop_hub(app) {
        state.quitting.store(false, Ordering::SeqCst);
        if let Ok(mut process) = state.hub.lock() {
            process.last_error = Some(error.clone());
        }
        let _ = show_main_window(app);
        return Err(error);
    }

    app.exit(0);
    Ok(())
}

pub fn request_app_exit(app: &AppHandle) -> Result<(), String> {
    attempt_quit(app)
}

pub fn handle_run_event(app: &AppHandle, event: &RunEvent) {
    match event {
        RunEvent::ExitRequested { api, .. } => {
            let state = app.state::<DesktopState>();
            if state.quitting.load(Ordering::SeqCst) {
                return;
            }
            api.prevent_exit();
            let _ = attempt_quit(app);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if !has_visible_windows {
                let _ = show_main_window(app);
            }
        }
        _ => {}
    }
}
