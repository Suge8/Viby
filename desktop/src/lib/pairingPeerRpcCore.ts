import type {
    PairingPeerAgentAvailabilityResult,
    PairingPeerAgentConfigResult,
    PairingPeerAgentLaunchConfigResult,
    PairingPeerBrowseDirectoryResult,
    PairingPeerHeartbeat,
    PairingPeerListSessionsResult,
    PairingPeerLoadAfterResult,
    PairingPeerMessage,
    PairingPeerMessagesResult,
    PairingPeerOpenAgentConfigResult,
    PairingPeerOpenSessionResult,
    PairingPeerPathsExistResult,
    PairingPeerRequest,
    PairingPeerResponse,
    PairingPeerRestoreAgentConfigResult,
    PairingPeerResumeSessionResult,
    PairingPeerRuntimeCapabilityResult,
    PairingPeerSaveAgentConfigResult,
    PairingPeerSendMessageResult,
    PairingPeerSpawnSessionResult,
    PairingPeerTerminalEventPayload,
} from '@viby/protocol/pairing'
import {
    PairingPeerAgentAvailabilityResultSchema,
    PairingPeerAgentConfigResultSchema,
    PairingPeerAgentLaunchConfigResultSchema,
    PairingPeerBrowseDirectoryResultSchema,
    PairingPeerCommandCapabilitiesResultSchema,
    PairingPeerHeartbeatSchema,
    PairingPeerImportLocalSessionResultSchema,
    PairingPeerListSessionsResultSchema,
    PairingPeerLoadAfterResultSchema,
    PairingPeerMessageSchema,
    PairingPeerMessagesResultSchema,
    PairingPeerOkResultSchema,
    PairingPeerOpenAgentConfigResultSchema,
    PairingPeerOpenSessionResultSchema,
    PairingPeerPathsExistResultSchema,
    PairingPeerRequestSchema,
    PairingPeerResponseSchema,
    PairingPeerRestoreAgentConfigResultSchema,
    PairingPeerResumeSessionResultSchema,
    PairingPeerRuntimeCapabilityResultSchema,
    PairingPeerRuntimeLocalSessionsResultSchema,
    PairingPeerSaveAgentConfigResultSchema,
    PairingPeerSendMessageResultSchema,
    PairingPeerSessionResultSchema,
    PairingPeerSpawnSessionResultSchema,
} from '@viby/protocol/pairing'
import type { SyncEvent } from '@viby/protocol/types'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { executePairingPeerPeripheralRequest } from './pairingPeerPeripheralRequests'
import {
    errorResponse,
    successResponse,
    toRemoteSessionHead,
    toRemoteSessionSummary,
} from './pairingPeerResponseSupport'
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
export function serializePairingTerminalEvent(event: PairingPeerTerminalEventPayload): string {
    return JSON.stringify(
        PairingPeerMessageSchema.parse({
            kind: 'event',
            event: 'terminal-event',
            payload: event,
        })
    )
}
export function parsePairingPeerRequest(raw: string): PairingPeerRequest {
    return PairingPeerRequestSchema.parse(JSON.parse(raw))
}

export function parsePairingHeartbeat(raw: string): PairingPeerHeartbeat | null {
    try {
        return PairingPeerHeartbeatSchema.parse(JSON.parse(raw))
    } catch {
        return null
    }
}

export function isPairingHeartbeat(raw: string): boolean {
    return parsePairingHeartbeat(raw) !== null
}
export async function executePairingPeerRequest(
    client: LocalHubPairingClient,
    request: PairingPeerRequest,
    options: { emitTerminalEvent?: (event: PairingPeerTerminalEventPayload) => void } = {}
): Promise<PairingPeerResponse> {
    try {
        const peripheralResponse = await executePairingPeerPeripheralRequest(client, request, options)
        if (peripheralResponse) {
            return peripheralResponse
        }

        switch (request.method) {
            case 'sessions.list': {
                const sessions = await client.listSessions()
                const result: PairingPeerListSessionsResult = PairingPeerListSessionsResultSchema.parse({
                    sessions: sessions.map(toRemoteSessionSummary),
                })
                return successResponse(request.id, result)
            }
            case 'session.open': {
                const view = await client.openSession(request.params.sessionId)
                const payload = request.params.includeLatestWindow === false ? toRemoteSessionHead(view) : view
                const result: PairingPeerOpenSessionResult = PairingPeerOpenSessionResultSchema.parse(payload)
                return successResponse(request.id, result)
            }
            case 'session.resume': {
                const view = await client.resumeSession(request.params.sessionId)
                const payload = request.params.includeLatestWindow === false ? toRemoteSessionHead(view) : view
                const result: PairingPeerResumeSessionResult = PairingPeerResumeSessionResultSchema.parse(payload)
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
            case 'session.messages': {
                const result: PairingPeerMessagesResult = PairingPeerMessagesResultSchema.parse(
                    await client.getMessages(request.params.sessionId, request.params)
                )
                return successResponse(request.id, result)
            }
            case 'session.send': {
                const result: PairingPeerSendMessageResult = PairingPeerSendMessageResultSchema.parse(
                    await client.sendMessage(request.params.sessionId, request.params.text, request.params.localId)
                )
                return successResponse(request.id, result)
            }
            case 'session.abort':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.abortSession(request.params.sessionId),
                    })
                )
            case 'session.archive':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.archiveSession(request.params.sessionId),
                    })
                )
            case 'session.close':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.closeSession(request.params.sessionId),
                    })
                )
            case 'session.unarchive':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.unarchiveSession(request.params.sessionId),
                    })
                )
            case 'session.rename':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.renameSession(request.params.sessionId, request.params.name),
                    })
                )
            case 'session.delete':
                await client.deleteSession(request.params.sessionId)
                return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
            case 'session.driver-switch':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.switchSessionDriver(
                            request.params.sessionId,
                            request.params.targetDriver
                        ),
                    })
                )
            case 'session.permission-mode':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.setPermissionMode(request.params.sessionId, request.params.mode),
                    })
                )
            case 'session.collaboration-mode':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.setCollaborationMode(request.params.sessionId, request.params.mode),
                    })
                )
            case 'session.model':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.setModel(request.params.sessionId, request.params.model),
                    })
                )
            case 'session.model-reasoning-effort':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.setModelReasoningEffort(
                            request.params.sessionId,
                            request.params.modelReasoningEffort
                        ),
                    })
                )
            case 'session.codex-service-tier':
                return successResponse(
                    request.id,
                    PairingPeerSessionResultSchema.parse({
                        session: await client.setCodexServiceTier(
                            request.params.sessionId,
                            request.params.codexServiceTier
                        ),
                    })
                )
            case 'session.command-capabilities':
                return successResponse(
                    request.id,
                    PairingPeerCommandCapabilitiesResultSchema.parse(
                        await client.getCommandCapabilities(request.params.sessionId, request.params.revision)
                    )
                )
            case 'permission.approve': {
                const { sessionId, requestId, ...body } = request.params
                await client.approvePermission(sessionId, requestId, body)
                return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
            }
            case 'permission.deny':
                await client.denyPermission(request.params.sessionId, request.params.requestId, request.params.decision)
                return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
            case 'runtime.capabilities': {
                const result: PairingPeerRuntimeCapabilityResult = PairingPeerRuntimeCapabilityResultSchema.parse(
                    await client.getRuntimeCapabilities(request.params ?? { depth: 'availability' })
                )
                return successResponse(request.id, result)
            }
            case 'runtime.agent-availability': {
                const result: PairingPeerAgentAvailabilityResult = PairingPeerAgentAvailabilityResultSchema.parse(
                    await client.getRuntimeAgentAvailability(request.params ?? {})
                )
                return successResponse(request.id, result)
            }
            case 'runtime.agent-config': {
                const result: PairingPeerAgentConfigResult = PairingPeerAgentConfigResultSchema.parse(
                    await client.getAgentConfig()
                )
                return successResponse(request.id, result)
            }
            case 'runtime.save-agent-config': {
                const result: PairingPeerSaveAgentConfigResult = PairingPeerSaveAgentConfigResultSchema.parse(
                    await client.saveAgentConfig(request.params)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.restore-agent-config': {
                const result: PairingPeerRestoreAgentConfigResult = PairingPeerRestoreAgentConfigResultSchema.parse(
                    await client.restoreAgentConfig(request.params)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.open-agent-config': {
                const result: PairingPeerOpenAgentConfigResult = PairingPeerOpenAgentConfigResultSchema.parse(
                    await client.openAgentConfig(request.params)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.paths-exists': {
                const result: PairingPeerPathsExistResult = PairingPeerPathsExistResultSchema.parse(
                    await client.checkRuntimePathsExists(request.params.paths)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.browse-directory': {
                const result: PairingPeerBrowseDirectoryResult = PairingPeerBrowseDirectoryResultSchema.parse(
                    await client.browseRuntimeDirectory(request.params?.path)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.agent-launch-config': {
                const result: PairingPeerAgentLaunchConfigResult = PairingPeerAgentLaunchConfigResultSchema.parse(
                    await client.resolveAgentLaunchConfig(request.params)
                )
                return successResponse(request.id, result)
            }
            case 'runtime.local-sessions':
                return successResponse(
                    request.id,
                    PairingPeerRuntimeLocalSessionsResultSchema.parse(
                        await client.listRuntimeLocalSessions(request.params.path, request.params.driver)
                    )
                )
            case 'runtime.import-local-session':
                return successResponse(
                    request.id,
                    PairingPeerImportLocalSessionResultSchema.parse(
                        await client.importRuntimeLocalSession(request.params)
                    )
                )
            case 'runtime.spawn': {
                const result: PairingPeerSpawnSessionResult = PairingPeerSpawnSessionResultSchema.parse(
                    await client.spawnSession(request.params)
                )
                return successResponse(request.id, result)
            }
        }
        throw new Error('Unsupported pairing peer method.')
    } catch (error) {
        return errorResponse(request.id, {
            code: 'pairing_peer_request_failed',
            message: error instanceof Error ? error.message : String(error),
        })
    }
}
