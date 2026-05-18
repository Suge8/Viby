fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_hub_snapshot",
            "start_hub",
            "stop_hub",
            "open_preferred_url",
            "open_url",
            "copy_text",
            "set_public_access_enabled",
            "get_pairing_sessions",
            "clear_pairing_sessions",
            "remove_pairing_session",
            "create_pairing_session",
            "approve_pairing_session",
            "refresh_pairing_session",
            "delete_pairing_session",
        ]),
    ))
    .expect("failed to build Viby desktop ACL manifest");
}
