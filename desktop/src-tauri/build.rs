fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "get_hub_snapshot",
            "start_hub",
            "stop_hub",
            "open_preferred_url",
            "copy_text",
            "get_pairing_session",
            "clear_pairing_session",
            "create_pairing_session",
            "approve_pairing_session",
            "refresh_pairing_session",
            "delete_pairing_session",
        ]),
    ))
    .expect("failed to build Viby desktop ACL manifest");
}
