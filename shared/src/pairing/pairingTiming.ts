export const PAIRING_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
export const PAIRING_TICKET_TTL_SECONDS = 10 * 60
export const PAIRING_RECONNECT_CHALLENGE_TTL_SECONDS = 60
export const PAIRING_TURN_CREDENTIAL_TTL_SECONDS = 10 * 60

export const PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS = 10 * 60
export const PAIRING_MOBILE_DISCONNECT_GRACE_MS = PAIRING_MOBILE_DISCONNECT_GRACE_SECONDS * 1000

export const PAIRING_CONNECT_TIMEOUT_MS = 18_000
export const PAIRING_PEER_REQUEST_TIMEOUT_MS = 30_000
export const PAIRING_SIGNAL_RECONNECT_DELAY_MS = 1_000
export const PAIRING_SIGNAL_PING_INTERVAL_MS = 20_000
export const PAIRING_SIGNAL_FOREGROUND_JOIN_ACK_TIMEOUT_MS = 2_000
// Throttle between two consecutive `peer.restartIce()` calls on the same
// peer. 10s was tuned for steady-state thrashing protection but proved
// too aggressive during Wi-Fi <-> cellular hand-over, where the second
// network event arrives within ~5s and would otherwise be ignored.
export const PAIRING_ICE_RESTART_MIN_INTERVAL_MS = 3_000
export const PAIRING_STATS_POLL_INTERVAL_MS = 10_000
export const PAIRING_TELEMETRY_REPORT_INTERVAL_MS = 60_000

export const PAIRING_PEER_HEARTBEAT_INTERVAL_MS = 15_000
export const PAIRING_PEER_HEARTBEAT_ACK_TIMEOUT_MS = 8_000
export const PAIRING_REMOTE_RECONNECT_BASE_DELAY_MS = 300
export const PAIRING_REMOTE_RECONNECT_MAX_DELAY_MS = 10_000
export const PAIRING_REMOTE_RECONNECT_MAX_ATTEMPTS = 15

// Time the guest will wait on `peer.connectionState=disconnected` before
// giving up on ICE restart and tearing down the whole transport. 8s used
// to fire before a cellular ICE round could finish; 15s leaves enough
// runway for TURN re-selection while still bounded.
export const PAIRING_PEER_DISCONNECT_CLIENT_GRACE_MS = 15_000
export const PAIRING_DESKTOP_TRANSPORT_RECOVERY_MS = 15_000
export const PAIRING_FOREGROUND_LIVENESS_PROBE_TIMEOUT_MS = 4_000
export const PAIRING_BOOT_STUCK_RESCUE_MS = 5_000
