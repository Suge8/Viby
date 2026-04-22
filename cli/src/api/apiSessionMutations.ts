import { logger } from '@/ui/logger'
import { runDetachedTask } from '@/utils/runDetachedTask'
import { backoff } from '@/utils/time'
import type { MetadataUpdateOptions } from './apiSessionState'
import { createWritableSessionMetadataSnapshot, stripLifecycleMetadataFields } from './apiSessionState'
import type { SessionSocketLike } from './apiSessionTransport'
import type { AgentState, Metadata, WritableSessionMetadata } from './types'
import { AgentStateSchema, MetadataSchema } from './types'
import { applyVersionedAck } from './versionedUpdate'

type MutationRecoveryState = {
    metadata: Metadata | null
    metadataVersion: number
    agentState: AgentState | null
    agentStateVersion: number
}

type MutationContext = {
    sessionId: string
    socket: SessionSocketLike
    metadataLock: {
        inLock: <T>(callback: () => Promise<T>) => Promise<T>
    }
    agentStateLock: {
        inLock: <T>(callback: () => Promise<T>) => Promise<T>
    }
    recoveryState: MutationRecoveryState
}

export async function updateMetadataAndWait(
    context: MutationContext,
    handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
    options?: MetadataUpdateOptions
): Promise<void> {
    await context.metadataLock.inLock(async () => {
        await backoff(async () => {
            const current = createWritableSessionMetadataSnapshot(context.recoveryState.metadata)
            const updated = stripLifecycleMetadataFields(handler(current))

            const answer = await context.socket.emitWithAck('update-metadata', {
                sid: context.sessionId,
                expectedVersion: context.recoveryState.metadataVersion,
                metadata: updated,
                touchUpdatedAt: options?.touchUpdatedAt,
            })

            applyVersionedAck(answer, {
                valueKey: 'metadata',
                parseValue: (value) => {
                    const parsed = MetadataSchema.safeParse(value)
                    return parsed.success ? parsed.data : null
                },
                applyValue: (value) => {
                    context.recoveryState.metadata = value
                },
                applyVersion: (version) => {
                    context.recoveryState.metadataVersion = version
                },
                logInvalidValue: (ackContext, version) => {
                    const suffix = ackContext === 'success' ? 'ack' : 'version-mismatch ack'
                    logger.debug(`[API] Ignoring invalid metadata value from ${suffix}`, { version })
                },
                invalidResponseMessage: 'Invalid update-metadata response',
                errorMessage: 'Metadata update failed',
                versionMismatchMessage: 'Metadata version mismatch',
            })
        })
    })
}

export function updateMetadata(
    context: MutationContext,
    handler: (metadata: WritableSessionMetadata) => WritableSessionMetadata,
    options?: MetadataUpdateOptions
): void {
    runDetachedTask(() => updateMetadataAndWait(context, handler, options), '[API] Metadata update failed')
}

export function updateAgentState(context: MutationContext, handler: (state: AgentState) => AgentState): void {
    runDetachedTask(
        () =>
            context.agentStateLock.inLock(async () => {
                await backoff(async () => {
                    const current = context.recoveryState.agentState ?? ({} as AgentState)
                    const updated = handler(current)

                    const answer = await context.socket.emitWithAck('update-state', {
                        sid: context.sessionId,
                        expectedVersion: context.recoveryState.agentStateVersion,
                        agentState: updated,
                    })

                    applyVersionedAck(answer, {
                        valueKey: 'agentState',
                        parseValue: (value) => {
                            const parsed = AgentStateSchema.safeParse(value)
                            return parsed.success ? parsed.data : null
                        },
                        applyValue: (value) => {
                            context.recoveryState.agentState = value
                        },
                        applyVersion: (version) => {
                            context.recoveryState.agentStateVersion = version
                        },
                        logInvalidValue: (ackContext, version) => {
                            const suffix = ackContext === 'success' ? 'ack' : 'version-mismatch ack'
                            logger.debug(`[API] Ignoring invalid agentState value from ${suffix}`, { version })
                        },
                        invalidResponseMessage: 'Invalid update-state response',
                        errorMessage: 'Agent state update failed',
                        versionMismatchMessage: 'Agent state version mismatch',
                    })
                })
            }),
        '[API] Agent state update failed'
    )
}
