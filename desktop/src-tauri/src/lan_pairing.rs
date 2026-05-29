use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;

use crate::state::{
    DesktopLanPairingSession, HubRuntimePhase, HubRuntimeStatus, HubSnapshot,
    PairingSessionSnapshot,
};
use crate::supervisor::refresh_snapshot;

const LAN_PAIRING_REQUEST_TIMEOUT_SECONDS: u64 = 5;

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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LanCreateResponse {
    pairing: PairingSessionSnapshot,
    events_url: String,
}

fn create_http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(LAN_PAIRING_REQUEST_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| error.to_string())
}

fn parse_http_error(status: StatusCode, body: &str) -> String {
    if body.is_empty() {
        return format!("LAN pairing request failed with HTTP {}", status.as_u16());
    }
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(message) = parsed.get("error").and_then(|value| value.as_str()) {
            return message.to_string();
        }
    }
    format!(
        "LAN pairing request failed with HTTP {}: {}",
        status.as_u16(),
        body
    )
}

fn ensure_ready_hub_snapshot(app: &AppHandle) -> Result<HubSnapshot, String> {
    let snapshot = refresh_snapshot(app)?;
    if !snapshot.running {
        return Err("当前中枢未运行，不能生成局域网邀请。".to_string());
    }
    let Some(status) = snapshot.status.as_ref() else {
        return Err("当前没有可用的中枢状态。".to_string());
    };
    if status.phase != HubRuntimePhase::Ready {
        return Err("中枢还没 ready，暂时不能生成局域网邀请。".to_string());
    }
    Ok(snapshot)
}

fn obtain_hub_jwt(client: &Client, status: &HubRuntimeStatus) -> Result<String, String> {
    let response = client
        .post(format!("{}/api/auth", status.local_hub_url))
        .json(&json!({ "accessToken": status.hub_owner_token }))
        .send()
        .map_err(|error| error.to_string())?;
    let auth_status = response.status();
    let auth_body = response.text().map_err(|error| error.to_string())?;
    if !auth_status.is_success() {
        return Err(parse_http_error(auth_status, &auth_body));
    }
    Ok(serde_json::from_str::<HubAuthResponse>(&auth_body)
        .map_err(|error| error.to_string())?
        .token)
}

fn rewrite_pairing_url(invite_base_url: &str, pairing_id: &str) -> Result<String, String> {
    let trimmed = invite_base_url.trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("无效的局域网入口地址。".to_string());
    }
    let base = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let url = reqwest::Url::parse(&base).map_err(|error| error.to_string())?;
    let mut next = url.clone();
    next.set_path(&format!("/p/{pairing_id}"));
    next.set_query(None);
    next.set_fragment(None);
    Ok(next.to_string())
}

fn lan_endpoint(base_url: &str, pairing_id: &str) -> Result<String, String> {
    let mut url = reqwest::Url::parse(base_url).map_err(|error| error.to_string())?;
    url.set_path(&format!("/api/lan-pairings/{pairing_id}"));
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

pub fn create_lan_pairing_session(
    app: &AppHandle,
    invite_base_url: String,
) -> Result<DesktopLanPairingSession, String> {
    let snapshot = ensure_ready_hub_snapshot(app)?;
    let status = snapshot
        .status
        .ok_or_else(|| "当前没有可用的中枢状态。".to_string())?;
    let client = create_http_client()?;
    let jwt = obtain_hub_jwt(&client, &status)?;

    let response = client
        .post(format!("{}/api/lan-pairings", status.local_hub_url))
        .bearer_auth(&jwt)
        .json(&json!({ "label": "Viby Desktop" }))
        .send()
        .map_err(|error| error.to_string())?;
    let response_status = response.status();
    let response_body = response.text().map_err(|error| error.to_string())?;
    if !response_status.is_success() {
        return Err(parse_http_error(response_status, &response_body));
    }
    let parsed = serde_json::from_str::<LanCreateResponse>(&response_body)
        .map_err(|error| error.to_string())?;
    let pairing_url = rewrite_pairing_url(&invite_base_url, &parsed.pairing.id)?;
    Ok(DesktopLanPairingSession {
        pairing: parsed.pairing,
        pairing_url,
        events_url: parsed.events_url,
    })
}

pub fn refresh_lan_pairing_session(
    app: &AppHandle,
    pairing: DesktopLanPairingSession,
) -> Result<DesktopLanPairingSession, String> {
    let snapshot = ensure_ready_hub_snapshot(app)?;
    let status = snapshot
        .status
        .ok_or_else(|| "当前没有可用的中枢状态。".to_string())?;
    let client = create_http_client()?;
    let jwt = obtain_hub_jwt(&client, &status)?;
    let endpoint = lan_endpoint(&status.local_hub_url, &pairing.pairing.id)?;
    let response = client
        .get(endpoint)
        .bearer_auth(&jwt)
        .send()
        .map_err(|error| error.to_string())?;
    let response_status = response.status();
    let response_body = response.text().map_err(|error| error.to_string())?;
    if response_status.as_u16() == 404 {
        return Err("LAN pairing session not found".to_string());
    }
    if !response_status.is_success() {
        return Err(parse_http_error(response_status, &response_body));
    }
    let envelope = serde_json::from_str::<PairingEnvelope>(&response_body)
        .map_err(|error| error.to_string())?;
    Ok(DesktopLanPairingSession {
        pairing: envelope.pairing,
        pairing_url: pairing.pairing_url,
        events_url: pairing.events_url,
    })
}

pub fn delete_lan_pairing_session(
    app: &AppHandle,
    pairing: DesktopLanPairingSession,
) -> Result<(), String> {
    let snapshot = ensure_ready_hub_snapshot(app)?;
    let status = snapshot
        .status
        .ok_or_else(|| "当前没有可用的中枢状态。".to_string())?;
    let client = create_http_client()?;
    let jwt = obtain_hub_jwt(&client, &status)?;
    let endpoint = lan_endpoint(&status.local_hub_url, &pairing.pairing.id)?;
    let response = client
        .delete(endpoint)
        .bearer_auth(&jwt)
        .send()
        .map_err(|error| error.to_string())?;
    let response_status = response.status();
    let response_body = response.text().map_err(|error| error.to_string())?;
    if !response_status.is_success() && response_status.as_u16() != 404 {
        return Err(parse_http_error(response_status, &response_body));
    }
    Ok(())
}
