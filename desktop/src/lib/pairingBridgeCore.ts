import type {
    PairingErrorPayload,
    PairingPeerListSessionsResult,
    PairingPeerLoadAfterResult,
    PairingPeerMessage,
    PairingPeerOpenSessionResult,
    PairingPeerRequest,
    PairingPeerResponse,
    PairingPeerResumeSessionResult,
    PairingPeerSendMessageResult,
    PairingRemoteSessionSummary,
} from '@viby/protocol/pairing'
import {
    PairingPeerListSessionsResultSchema,
    PairingPeerLoadAfterResultSchema,
    PairingPeerMessageSchema,
    PairingPeerOpenSessionResultSchema,
    PairingPeerRequestSchema,
    PairingPeerResponseSchema,
    PairingPeerResumeSessionResultSchema,
    PairingPeerSendMessageResultSchema,
} from '@viby/protocol/pairing'
import type { SessionSummary, SyncEvent } from '@viby/protocol/types'
import type { LocalHubPairingClient } from './localHubPairingClient'

function toRemoteSessionSummary(session: SessionSummary): PairingRemoteSessionSummary {
    return {
        id: session.id,
        active: session.active,
        thinking: session.thinking,
        updatedAt: session.updatedAt,
        latestActivityAt: session.latestActivityAt ?? null,
        lifecycleState: session.lifecycleState,
        resumeAvailable: session.resumeAvailable,
        model: session.model,
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

function successResponse(id: string, result: unknown): PairingPeerResponse {
    return PairingPeerResponseSchema.parse({
        kind: 'response',
        id,
        ok: true,
        result,
    })
}

function errorResponse(id: string, error: PairingErrorPayload): PairingPeerResponse {
    return PairingPeerResponseSchema.parse({
        kind: 'response',
        id,
        ok: false,
        error,
    })
}

export function serializePairingPeerMessage(message: PairingPeerMessage | PairingPeerResponse): string {
    return JSON.stringify(PairingPeerMessageSchema.parse(message))
}

export function serializePairingSyncEvent(event: SyncEvent): string {
    return JSON.stringify(
        PairingPeerMessageSchema.parse({
            kind: 'event',
            event: 'sync-event',
            payload: event,
        })
    )
}

export function parsePairingPeerRequest(raw: string): PairingPeerRequest {
    return PairingPeerRequestSchema.parse(JSON.parse(raw))
}

export async function executePairingPeerRequest(
    client: LocalHubPairingClient,
    request: PairingPeerRequest
): Promise<PairingPeerResponse> {
    try {
        switch (request.method) {
            case 'sessions.list': {
                const sessions = await client.listSessions()
                const result: PairingPeerListSessionsResult = PairingPeerListSessionsResultSchema.parse({
                    sessions: sessions.map(toRemoteSessionSummary),
                })
                return successResponse(request.id, result)
            }
            case 'session.open': {
                const result: PairingPeerOpenSessionResult = PairingPeerOpenSessionResultSchema.parse(
                    await client.openSession(request.params.sessionId)
                )
                return successResponse(request.id, result)
            }
            case 'session.resume': {
                const result: PairingPeerResumeSessionResult = PairingPeerResumeSessionResultSchema.parse(
                    await client.resumeSession(request.params.sessionId)
                )
                return successResponse(request.id, result)
            }
            case 'session.load-after': {
                const result: PairingPeerLoadAfterResult = PairingPeerLoadAfterResultSchema.parse(
                    await client.loadMessagesAfter(
                        request.params.sessionId,
                        request.params.afterSeq,
                        request.params.limit ?? 200
                    )
                )
                return successResponse(request.id, result)
            }
            case 'session.send': {
                const result: PairingPeerSendMessageResult = PairingPeerSendMessageResultSchema.parse({
                    session: await client.sendMessage(
                        request.params.sessionId,
                        request.params.text,
                        request.params.localId
                    ),
                })
                return successResponse(request.id, result)
            }
        }
    } catch (error) {
        return errorResponse(request.id, {
            code: 'pairing_peer_request_failed',
            message: error instanceof Error ? error.message : String(error),
        })
    }
}
