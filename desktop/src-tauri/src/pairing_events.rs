use std::collections::HashMap;
use std::error::Error;
use std::sync::Mutex;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::launch::append_desktop_log;

/// Tauri event payload pushed to the desktop webview when broker / hub LAN
/// SSE emits a `pairing.updated` frame. The frontend listens to
/// `pairing-events:<pairing_id>` on the global `AppHandle`.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PairingEventPayload {
    pub pairing_id: String,
    pub kind: PairingEventKind,
    pub data: Option<serde_json::Value>,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PairingEventKind {
    Update,
    Disconnect,
    Failure,
}

#[derive(Default)]
pub struct PairingEventsState {
    cancellers: Mutex<HashMap<String, tokio::sync::watch::Sender<bool>>>,
}

impl PairingEventsState {
    pub fn subscribe(&self, pairing_id: &str) -> tokio::sync::watch::Receiver<bool> {
        let (sender, receiver) = tokio::sync::watch::channel(false);
        let mut cancellers = self
            .cancellers
            .lock()
            .expect("pairing events mutex poisoned");
        if let Some(previous) = cancellers.insert(pairing_id.to_string(), sender) {
            let _ = previous.send(true);
        }
        receiver
    }

    pub fn cancel(&self, pairing_id: &str) {
        let mut cancellers = self
            .cancellers
            .lock()
            .expect("pairing events mutex poisoned");
        if let Some(sender) = cancellers.remove(pairing_id) {
            let _ = sender.send(true);
        }
    }
}

fn build_topic(pairing_id: &str) -> String {
    format!("pairing-events:{pairing_id}")
}

fn format_error_chain(error: &dyn Error) -> String {
    let mut message = error.to_string();
    let mut source = error.source();
    while let Some(error) = source {
        message.push_str(": ");
        message.push_str(&error.to_string());
        source = error.source();
    }
    message
}

fn redact_url_tokens(message: &str) -> String {
    let mut output = String::with_capacity(message.len());
    let mut rest = message;
    while let Some(index) = rest.find("token=") {
        output.push_str(&rest[..index + 6]);
        output.push_str("<redacted>");
        rest = &rest[index + 6..];
        let end = rest
            .find(|character: char| {
                character == '&' || character == ')' || character.is_whitespace()
            })
            .unwrap_or(rest.len());
        rest = &rest[end..];
    }
    output.push_str(rest);
    output
}

fn parse_event_block(block: &str) -> (Option<String>, Option<String>) {
    let mut event_name: Option<String> = None;
    let mut data_lines: Vec<&str> = Vec::new();
    for raw in block.lines() {
        let line = raw.trim_end_matches('\r');
        if let Some(value) = line.strip_prefix("event:") {
            event_name = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.trim_start());
        }
    }
    let data = if data_lines.is_empty() {
        None
    } else {
        Some(data_lines.join("\n"))
    };
    (event_name, data)
}

fn emit_event(
    app: &AppHandle,
    pairing_id: &str,
    kind: PairingEventKind,
    data: Option<serde_json::Value>,
    message: Option<String>,
) {
    let topic = build_topic(pairing_id);
    let payload = PairingEventPayload {
        pairing_id: pairing_id.to_string(),
        kind,
        data,
        message,
    };
    if let Err(error) = app.emit(&topic, payload) {
        append_desktop_log(&format!("pairing-events emit failed: {error}"));
    }
}

/// Spawn an async SSE consumer that streams `events_url` for `pairing_id` and
/// re-emits each `pairing.updated` snapshot as a Tauri event. The async task
/// exits when the caller drops the cancel `Receiver` or the stream errors.
pub fn spawn_pairing_event_stream(
    app: AppHandle,
    state: &PairingEventsState,
    pairing_id: String,
    events_url: String,
) {
    let mut cancel_rx = state.subscribe(&pairing_id);
    let pairing_for_task = pairing_id.clone();
    tauri::async_runtime::spawn(async move {
        let client = match Client::builder().timeout(Duration::from_secs(0)).build() {
            Ok(value) => value,
            Err(error) => {
                emit_event(
                    &app,
                    &pairing_for_task,
                    PairingEventKind::Failure,
                    None,
                    Some(format!("Failed to build pairing events client: {error}")),
                );
                return;
            }
        };

        append_desktop_log(&format!(
            "pairing-events connecting SSE pairing={pairing_for_task}"
        ));
        let request = client
            .get(&events_url)
            .header("accept", "text/event-stream");
        let response = match request.send().await {
            Ok(value) => value,
            Err(error) => {
                let message = redact_url_tokens(&format_error_chain(&error));
                append_desktop_log(&format!(
                    "pairing-events connect failed pairing={pairing_for_task}: {message}"
                ));
                emit_event(
                    &app,
                    &pairing_for_task,
                    PairingEventKind::Failure,
                    None,
                    Some(format!("SSE connect failed: {message}")),
                );
                return;
            }
        };
        if !response.status().is_success() {
            append_desktop_log(&format!(
                "pairing-events http error pairing={pairing_for_task} status={}",
                response.status().as_u16()
            ));
            emit_event(
                &app,
                &pairing_for_task,
                PairingEventKind::Failure,
                None,
                Some(format!(
                    "SSE rejected with HTTP {}",
                    response.status().as_u16()
                )),
            );
            return;
        }
        append_desktop_log(&format!(
            "pairing-events stream open pairing={pairing_for_task}"
        ));

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        loop {
            tokio::select! {
                changed = cancel_rx.changed() => {
                    if changed.is_err() || *cancel_rx.borrow() {
                        break
                    }
                }
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            buffer.push_str(&String::from_utf8_lossy(&bytes));
                            while let Some(boundary) = buffer.find("\n\n") {
                                let block = buffer[..boundary].to_string();
                                buffer.drain(..boundary + 2);
                                let (event_name, data) = parse_event_block(&block);
                                let kind = match event_name.as_deref() {
                                    Some("pairing.updated") => PairingEventKind::Update,
                                    Some("bye") => PairingEventKind::Disconnect,
                                    _ => continue,
                                };
                                let parsed = data.as_deref().and_then(|raw| {
                                    serde_json::from_str::<serde_json::Value>(raw).ok()
                                });
                                emit_event(&app, &pairing_for_task, kind, parsed, None);
                            }
                        }
                        Some(Err(error)) => {
                            let message = redact_url_tokens(&format_error_chain(&error));
                            append_desktop_log(&format!(
                                "pairing-events stream error pairing={pairing_for_task}: {message}"
                            ));
                            emit_event(
                                &app,
                                &pairing_for_task,
                                PairingEventKind::Failure,
                                None,
                                Some(format!("SSE stream error: {message}")),
                            );
                            break
                        }
                        None => break,
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{format_error_chain, redact_url_tokens};
    use std::error::Error;
    use std::fmt;

    #[test]
    fn redacts_pairing_event_url_tokens() {
        let message = "error sending request for url (https://pair.viby.run/pairings/id/events?token=secret-1&x=1)";

        assert_eq!(
            redact_url_tokens(message),
            "error sending request for url (https://pair.viby.run/pairings/id/events?token=<redacted>&x=1)"
        );
    }

    #[derive(Debug)]
    struct ChainError(&'static str, Option<Box<dyn Error>>);

    impl fmt::Display for ChainError {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str(self.0)
        }
    }

    impl Error for ChainError {
        fn source(&self) -> Option<&(dyn Error + 'static)> {
            self.1.as_deref()
        }
    }

    #[test]
    fn formats_pairing_event_error_chain() {
        let error = ChainError(
            "request failed",
            Some(Box::new(ChainError("dns failed", None))),
        );

        assert_eq!(format_error_chain(&error), "request failed: dns failed");
    }
}
