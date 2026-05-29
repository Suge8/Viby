use std::path::PathBuf;

#[cfg(unix)]
use std::process::{Command, Stdio};

use notify::{event::CreateKind, Event, EventKind};

use super::should_refresh_for_event;
#[cfg(unix)]
use super::{describe_child_exit, take_desktop_parent_pipe_guard};

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

#[cfg(unix)]
#[test]
fn successful_child_exit_has_no_error_message() {
    let status = Command::new("true")
        .status()
        .expect("true should run on unix test hosts");

    assert!(describe_child_exit(&Ok(status)).is_none());
}

#[cfg(unix)]
#[test]
fn failed_child_exit_has_error_message() {
    let status = Command::new("false")
        .status()
        .expect("false should run on unix test hosts");

    assert_eq!(
        describe_child_exit(&Ok(status)),
        Some(format!("Hub process exited: {status}"))
    );
}

#[cfg(unix)]
#[test]
fn parent_pipe_guard_keeps_child_stdin_open_until_dropped() {
    let mut child = Command::new("cat")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("cat should spawn");

    let guard = take_desktop_parent_pipe_guard(&mut child).expect("stdin pipe should exist");

    assert!(child.stdin.is_none());
    assert!(child.try_wait().expect("child state should read").is_none());

    drop(guard);
    let status = child.wait().expect("cat should exit after stdin closes");
    assert!(status.success());
}
