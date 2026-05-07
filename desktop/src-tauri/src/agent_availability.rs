use std::process::Stdio;

use serde_json::Value;
use tauri::AppHandle;

use crate::launch;
use crate::state::ListAgentAvailabilityRequest;

const INTERNAL_AGENT_AVAILABILITY_COMMAND: &str = "__internal_agent_availability";
const DIRECTORY_FLAG: &str = "--directory";
const FORCE_REFRESH_FLAG: &str = "--force-refresh";

fn build_agent_availability_args(request: &ListAgentAvailabilityRequest) -> Vec<String> {
    let mut args = vec![INTERNAL_AGENT_AVAILABILITY_COMMAND.to_string()];

    if request.force_refresh.unwrap_or(false) {
        args.push(FORCE_REFRESH_FLAG.to_string());
    }

    if let Some(directory) = request
        .directory
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        args.push(DIRECTORY_FLAG.to_string());
        args.push(directory.to_string());
    }

    args
}

pub fn list_agent_availability(
    app: &AppHandle,
    request: ListAgentAvailabilityRequest,
) -> Result<Value, String> {
    let mut command = launch::create_cli_command(app)?;
    command.args(build_agent_availability_args(&request));
    command.stdin(Stdio::null());
    command.stderr(Stdio::piped());
    command.stdout(Stdio::piped());

    let output = command.output().map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }

    serde_json::from_slice(&output.stdout).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_minimal_internal_command_args() {
        assert_eq!(
            build_agent_availability_args(&ListAgentAvailabilityRequest::default()),
            vec![INTERNAL_AGENT_AVAILABILITY_COMMAND.to_string()]
        );
    }

    #[test]
    fn builds_refreshed_directory_command_args() {
        assert_eq!(
            build_agent_availability_args(&ListAgentAvailabilityRequest {
                directory: Some("  /tmp/viby  ".to_string()),
                force_refresh: Some(true),
            }),
            vec![
                INTERNAL_AGENT_AVAILABILITY_COMMAND.to_string(),
                FORCE_REFRESH_FLAG.to_string(),
                DIRECTORY_FLAG.to_string(),
                "/tmp/viby".to_string(),
            ]
        );
    }
}
