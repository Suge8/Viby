use std::fs;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use serde_json::Value as JsonValue;

use crate::launch::resolve_shared_viby_home_dir;
use crate::state::DesktopPairingSession;

const PAIRING_SESSIONS_FILE_NAME: &str = "desktop-pairing-sessions.json";
const LEGACY_PAIRING_SESSION_FILE_NAME: &str = "desktop-pairing-session.json";

fn sessions_file_path() -> Result<PathBuf, String> {
    Ok(resolve_shared_viby_home_dir()?.join(PAIRING_SESSIONS_FILE_NAME))
}

fn legacy_single_session_file_path() -> Result<PathBuf, String> {
    Ok(resolve_shared_viby_home_dir()?.join(LEGACY_PAIRING_SESSION_FILE_NAME))
}

fn temp_file_path(path: &Path) -> Result<PathBuf, String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Failed to resolve pairing session file name.".to_string())?;
    Ok(path.with_file_name(format!(".{name}.{}.tmp", std::process::id())))
}

fn set_private_permissions(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn replace_file(temp_path: &Path, path: &Path) -> Result<(), String> {
    match fs::rename(temp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => {
            #[cfg(target_os = "windows")]
            if error.kind() == ErrorKind::AlreadyExists && path.exists() {
                fs::remove_file(path).map_err(|remove_error| remove_error.to_string())?;
                return fs::rename(temp_path, path)
                    .map_err(|rename_error| rename_error.to_string());
            }
            let _ = fs::remove_file(temp_path);
            Err(error.to_string())
        }
    }
}

fn write_private_file(path: &Path, content: &[u8]) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    }

    let temp_path = temp_file_path(path)?;
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let result = (|| {
        let mut file = options
            .open(&temp_path)
            .map_err(|error| error.to_string())?;
        file.write_all(content).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    replace_file(&temp_path, path)?;
    set_private_permissions(path)
}

fn remove_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

fn parse_sessions_payload(raw: &str) -> Vec<DesktopPairingSession> {
    let parsed = match serde_json::from_str::<JsonValue>(raw) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    if parsed.is_array() {
        return serde_json::from_value::<Vec<DesktopPairingSession>>(parsed).unwrap_or_default();
    }
    if parsed.is_object() {
        return serde_json::from_value::<DesktopPairingSession>(parsed)
            .map(|session| vec![session])
            .unwrap_or_default();
    }
    Vec::new()
}

fn migrate_legacy_single_session_file_if_present() -> Result<(), String> {
    let legacy_path = legacy_single_session_file_path()?;
    let raw = match fs::read_to_string(&legacy_path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    let sessions = parse_sessions_payload(&raw);
    if !sessions.is_empty() {
        write_sessions(&sessions)?;
    }
    remove_file_if_exists(&legacy_path)
}

fn write_sessions(sessions: &[DesktopPairingSession]) -> Result<(), String> {
    let payload =
        serde_json::to_vec(&sessions.to_vec()).map_err(|error| error.to_string())?;
    write_private_file(&sessions_file_path()?, &payload)
}

pub fn read_pairing_sessions() -> Result<Vec<DesktopPairingSession>, String> {
    migrate_legacy_single_session_file_if_present()?;
    let path = sessions_file_path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let sessions = parse_sessions_payload(&raw);
    if sessions.is_empty() {
        remove_file_if_exists(&path)?;
    }
    Ok(sessions)
}

pub fn persist_pairing_session(pairing: &DesktopPairingSession) -> Result<(), String> {
    let mut sessions = read_pairing_sessions()?;
    if let Some(existing) = sessions.iter_mut().find(|item| item.pairing.id == pairing.pairing.id)
    {
        *existing = pairing.clone();
    } else {
        sessions.push(pairing.clone());
    }
    write_sessions(&sessions)
}

pub fn persist_pairing_session_if_changed(
    previous: &DesktopPairingSession,
    next: &DesktopPairingSession,
) -> Result<(), String> {
    if previous == next {
        return Ok(());
    }
    persist_pairing_session(next)
}

pub fn remove_pairing_session(pairing_id: &str) -> Result<(), String> {
    let sessions = read_pairing_sessions()?;
    let next: Vec<DesktopPairingSession> = sessions
        .into_iter()
        .filter(|session| session.pairing.id != pairing_id)
        .collect();
    if next.is_empty() {
        return remove_file_if_exists(&sessions_file_path()?);
    }
    write_sessions(&next)
}

pub fn clear_pairing_sessions() -> Result<(), String> {
    remove_file_if_exists(&sessions_file_path()?)?;
    remove_file_if_exists(&legacy_single_session_file_path()?)
}
