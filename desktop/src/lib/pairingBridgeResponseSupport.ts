import type { PairingErrorPayload, PairingPeerResponse, PairingRemoteSessionSummary } from '@viby/protocol/pairing'
import { PairingPeerResponseSchema } from '@viby/protocol/pairing'
import type { SessionSummary } from '@viby/protocol/types'

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
                  name: session.metadata.name,
                  path: session.metadata.path,
                  driver: session.metadata.driver,
                  summary: session.metadata.summary,
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
