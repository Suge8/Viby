use std::fs;

use crate::launch::{resolve_shared_viby_home_dir, settings_file_path};

const PUBLIC_ACCESS_KEY: &str = "public_access_enabled";

fn bool_line(key: &str, enabled: bool) -> String {
    format!("{key} = {enabled}")
}

fn is_key_line(line: &str, key: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with(key) && trimmed[key.len()..].trim_start().starts_with('=')
}

fn upsert_root_bool(raw: &str, key: &str, enabled: bool) -> String {
    let mut lines: Vec<String> = raw.lines().map(str::to_string).collect();
    let line = bool_line(key, enabled);
    let mut insert_at = lines.len();

    for (index, current) in lines.iter_mut().enumerate() {
        let trimmed = current.trim_start();
        if trimmed.starts_with('[') {
            insert_at = insert_at.min(index);
            break;
        }
        if is_key_line(current, key) {
            *current = line;
            return format!("{}\n", lines.join("\n").trim_end());
        }
    }

    lines.insert(insert_at, line);
    format!("{}\n", lines.join("\n").trim_end())
}

pub fn write_public_access_enabled(enabled: bool) -> Result<(), String> {
    let settings_path = settings_file_path()?;
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    } else {
        fs::create_dir_all(resolve_shared_viby_home_dir()?).map_err(|error| error.to_string())?;
    }
    let raw = fs::read_to_string(&settings_path).unwrap_or_default();
    fs::write(
        settings_path,
        upsert_root_bool(&raw, PUBLIC_ACCESS_KEY, enabled),
    )
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::upsert_root_bool;

    #[test]
    fn inserts_public_access_before_sections() {
        let next = upsert_root_bool(
            "hub_owner_token = \"x\"\n\n[system]\n",
            "public_access_enabled",
            false,
        );
        assert!(next.contains("hub_owner_token = \"x\"\n\npublic_access_enabled = false\n[system]"));
    }

    #[test]
    fn replaces_existing_public_access() {
        let next = upsert_root_bool(
            "public_access_enabled = true\n[system]\n",
            "public_access_enabled",
            false,
        );
        assert!(next.starts_with("public_access_enabled = false\n"));
    }
}
