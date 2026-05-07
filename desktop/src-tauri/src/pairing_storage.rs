use std::fs;
use std::fs::OpenOptions;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use crate::launch::resolve_shared_viby_home_dir;
use crate::state::DesktopPairingSession;

const PAIRING_SESSION_FILE_NAME: &str = "desktop-pairing-session.json";

fn pairing_session_file_path() -> Result<PathBuf, String> {
    Ok(resolve_shared_viby_home_dir()?.join(PAIRING_SESSION_FILE_NAME))
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

pub fn persist_pairing_session(pairing: &DesktopPairingSession) -> Result<(), String> {
    write_private_file(
        &pairing_session_file_path()?,
        &serde_json::to_vec(pairing).map_err(|error| error.to_string())?,
    )
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

pub fn read_pairing_session() -> Result<Option<DesktopPairingSession>, String> {
    let path = pairing_session_file_path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };

    match serde_json::from_str::<DesktopPairingSession>(&raw) {
        Ok(pairing) => Ok(Some(pairing)),
        Err(_) => {
            remove_file_if_exists(&path)?;
            Ok(None)
        }
    }
}

pub fn clear_pairing_session() -> Result<(), String> {
    remove_file_if_exists(&pairing_session_file_path()?)
}
