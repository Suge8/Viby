import { CopilotClient, type PermissionHandler } from '@github/copilot-sdk'
import { logger } from '@/ui/logger'

type CopilotSdkSession = Awaited<ReturnType<CopilotClient['createSession']>>

type CopilotSessionLifecycleTarget = {
    durableSessionId: string
    sessionId: string | null
    currentModel: string | undefined
}

export function isCopilotSessionMissingError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false
    }

    return /session not found/i.test(error.message)
}

export async function attachCopilotSdkSession(options: {
    client: CopilotClient
    session: CopilotSessionLifecycleTarget
    permissionHandler: PermissionHandler
    reportSessionId: (sessionId: string) => void
}): Promise<CopilotSdkSession> {
    const { client, session, permissionHandler, reportSessionId } = options
    const hasCanonicalPersistedSession = session.sessionId === session.durableSessionId

    try {
        const resumed = await client.resumeSession(session.durableSessionId, {
            model: session.currentModel,
            onPermissionRequest: permissionHandler,
            streaming: true,
        })
        reportSessionId(resumed.sessionId)
        return resumed
    } catch (error) {
        if (!isCopilotSessionMissingError(error) || hasCanonicalPersistedSession) {
            throw error
        }

        logger.debug(
            `[copilot-remote] No durable Copilot SDK session found for ${session.durableSessionId}; creating it now`
        )
        const created = await client.createSession({
            sessionId: session.durableSessionId,
            model: session.currentModel ?? 'gpt-5',
            onPermissionRequest: permissionHandler,
            streaming: true,
        })
        reportSessionId(created.sessionId)
        return created
    }
}

export async function disconnectCopilotSdkSession(session: CopilotSdkSession | null | undefined): Promise<void> {
    await session?.disconnect()
}
