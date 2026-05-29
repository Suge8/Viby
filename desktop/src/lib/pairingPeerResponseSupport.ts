import type {
    PairingErrorPayload,
    PairingPeerResponse,
    PairingPeerSessionHeadResult,
    PairingRemoteSessionSummary,
} from '@viby/protocol/pairing'
import { PairingPeerResponseSchema } from '@viby/protocol/pairing'
import type { SessionSummary, SessionViewSnapshot } from '@viby/protocol/types'

const REMOTE_SUMMARY_TEXT_MAX_CHARS = 160
const REMOTE_PATH_MAX_CHARS = 240
const REMOTE_PATH_TAIL_SEGMENTS = 4

function compactText(value: string): string {
    if (value.length <= REMOTE_SUMMARY_TEXT_MAX_CHARS) return value
    return `${value.slice(0, REMOTE_SUMMARY_TEXT_MAX_CHARS - 1)}…`
}

function compactOptionalText(value: string | undefined): string | undefined {
    return value ? compactText(value) : undefined
}

function compactPath(path: string): string {
    if (path.length <= REMOTE_PATH_MAX_CHARS) return path
    const tail = path
        .split(/[\\/]+/)
        .filter(Boolean)
        .slice(-REMOTE_PATH_TAIL_SEGMENTS)
        .join('/')
    const compacted = tail ? `…/${tail}` : path.slice(-REMOTE_PATH_MAX_CHARS)
    return compacted.length <= REMOTE_PATH_MAX_CHARS ? compacted : `…${compacted.slice(1 - REMOTE_PATH_MAX_CHARS)}`
}

export function toRemoteSessionHead(view: SessionViewSnapshot): PairingPeerSessionHeadResult {
    return {
        session: view.session,
        stream: view.stream,
        watermark: view.watermark,
        interactivity: view.interactivity,
    }
}

export function toRemoteSessionSummary(session: SessionSummary): PairingRemoteSessionSummary {
    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        updatedAt: session.updatedAt,
        latestActivityAt: session.latestActivityAt ?? null,
        lifecycleState: session.lifecycleState,
        resumeAvailable: session.resumeAvailable,
        model: session.model,
        codexServiceTier: session.codexServiceTier,
        metadata: session.metadata
            ? {
                  name: compactOptionalText(session.metadata.name),
                  path: compactPath(session.metadata.path),
                  driver: session.metadata.driver,
                  summary: session.metadata.summary
                      ? { ...session.metadata.summary, text: compactText(session.metadata.summary.text) }
                      : undefined,
              }
            : null,
    }
}

export function successResponse(id: string, result: unknown): PairingPeerResponse {
    return PairingPeerResponseSchema.parse({
        kind: 'response',
        id,
        ok: true,
        result,
    })
}

export function errorResponse(id: string, error: PairingErrorPayload): PairingPeerResponse {
    return PairingPeerResponseSchema.parse({
        kind: 'response',
        id,
        ok: false,
        error,
    })
}
