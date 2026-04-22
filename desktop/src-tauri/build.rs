fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_hub_snapshot",
                "start_hub",
                "stop_hub",
                "open_preferred_url",
                "copy_text",
                "create_pairing_session",
            ]),
        ),
    )
    .expect("failed to build Viby desktop ACL manifest");
}
