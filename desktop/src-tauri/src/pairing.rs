use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;

use crate::state::{DesktopPairingSession, HubRuntimePhase, HubSnapshot, PairingSessionSnapshot};
use crate::supervisor::refresh_snapshot;

const PAIRING_REQUEST_TIMEOUT_SECONDS: u64 = 5;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HubAuthResponse {
    token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairingEnvelope {
    pairing: PairingSessionSnapshot,
}

fn ensure_ready_hub_snapshot(app: &AppHandle) -> Result<HubSnapshot, String> {
    let snapshot = refresh_snapshot(app)?;
    if !snapshot.running {
        return Err("当前中枢未运行，不能生成配对码。".to_string());
    }

    let Some(status) = snapshot.status.as_ref() else {
        return Err("当前没有可用的中枢状态。".to_string());
    };

    if status.phase != HubRuntimePhase::Ready {
        return Err("中枢还没 ready，暂时不能生成配对码。".to_string());
    }

    Ok(snapshot)
}

fn parse_http_error(status: StatusCode, body: &str) -> String {
    if body.is_empty() {
        return format!("请求失败，HTTP {}", status.as_u16());
    }

    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(message) = parsed.get("error").and_then(|value| value.as_str()) {
            return message.to_string();
        }
    }

    format!("请求失败，HTTP {}: {}", status.as_u16(), body)
}

fn create_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(PAIRING_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())
}

fn pairing_broker_endpoint(pairing: &DesktopPairingSession, path_suffix: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(&pairing.pairing_url).map_err(|error| error.to_string())?;
    url.set_query(None);
    url.set_fragment(None);
    url.set_path(&format!("/pairings/{}/{}", pairing.pairing.id, path_suffix));
    Ok(url.to_string())
}

pub fn create_pairing_session(app: &AppHandle) -> Result<DesktopPairingSession, String> {
    let snapshot = ensure_ready_hub_snapshot(app)?;
    let status = snapshot
        .status
        .ok_or_else(|| "当前没有可用的中枢状态。".to_string())?;
    let client = create_http_client()?;

    let auth_response = client
        .post(format!("{}/api/auth", status.local_hub_url))
        .json(&json!({ "accessToken": status.cli_api_token }))
        .send()
        .map_err(|error| error.to_string())?;

    let auth_status = auth_response.status();
    let auth_body = auth_response.text().map_err(|error| error.to_string())?;
    if !auth_status.is_success() {
        return Err(parse_http_error(auth_status, &auth_body));
    }

    let auth = serde_json::from_str::<HubAuthResponse>(&auth_body).map_err(|error| error.to_string())?;
    let pairing_response = client
        .post(format!("{}/api/pairings", status.local_hub_url))
        .bearer_auth(auth.token)
        .json(&json!({ "label": "Viby Desktop" }))
        .send()
        .map_err(|error| error.to_string())?;

    let pairing_status = pairing_response.status();
    let pairing_body = pairing_response.text().map_err(|error| error.to_string())?;
    if !pairing_status.is_success() {
        return Err(parse_http_error(pairing_status, &pairing_body));
    }

    serde_json::from_str::<DesktopPairingSession>(&pairing_body).map_err(|error| error.to_string())
}

pub fn approve_pairing_session(pairing: DesktopPairingSession) -> Result<DesktopPairingSession, String> {
    let client = create_http_client()?;
    let response = client
        .post(pairing_broker_endpoint(&pairing, "approve")?)
        .bearer_auth(&pairing.host_token)
        .send()
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(parse_http_error(status, &body));
    }

    let approved = serde_json::from_str::<PairingEnvelope>(&body).map_err(|error| error.to_string())?;
    Ok(DesktopPairingSession {
        pairing: approved.pairing,
        ..pairing
    })
}

pub fn delete_pairing_session(pairing: DesktopPairingSession) -> Result<(), String> {
    let client = create_http_client()?;
    let response = client
        .delete(
            reqwest::Url::parse(&pairing.pairing_url)
                .map_err(|error| error.to_string())?
                .join(&format!("/pairings/{}", pairing.pairing.id))
                .map_err(|error| error.to_string())?
                .to_string(),
        )
        .bearer_auth(&pairing.host_token)
        .send()
        .map_err(|error| error.to_string())?;

    let status = response.status();
    let body = response.text().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(parse_http_error(status, &body));
    }

    Ok(())
}
