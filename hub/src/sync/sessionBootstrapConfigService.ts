import type { AgentFlavor, Session } from '@viby/protocol/types'
import type { SessionConfigPatch } from './sessionPayloadTypes'

type GetSession = (sessionId: string) => Session | undefined
type MutateSessionMetadata = (
    sessionId: string,
    buildNextMetadata: (currentMetadata: NonNullable<Session['metadata']>) => NonNullable<Session['metadata']>,
    options?: { touchUpdatedAt?: boolean }
) => Promise<Session>
type ApplySessionConfig = (sessionId: string, config: SessionConfigPatch) => void

export class SessionBootstrapConfigService {
    constructor(
        private readonly getSession: GetSession,
        private readonly mutateSessionMetadata: MutateSessionMetadata,
        private readonly applySessionConfig: ApplySessionConfig
    ) {}

    async ensureSessionDriver(
        sessionId: string,
        driver: AgentFlavor,
        options?: { model?: string | null; codexServiceTier?: Session['codexServiceTier'] }
    ): Promise<Session | null> {
        const session = this.getSession(sessionId)
        if (!session) {
            return null
        }

        const hasDriver = session.metadata?.driver != null
        const hasModelChange = options?.model !== undefined && session.model !== options.model
        const hasCodexServiceTierChange =
            options?.codexServiceTier !== undefined && session.codexServiceTier !== options.codexServiceTier
        if (hasDriver && !hasModelChange && !hasCodexServiceTierChange) {
            return session
        }

        if (!hasDriver) {
            const fallbackMetadata = session.metadata ?? { path: '', host: '' }
            const updatedSession = await this.mutateSessionMetadata(
                sessionId,
                () => ({ ...fallbackMetadata, driver }),
                { touchUpdatedAt: false }
            )

            if (hasModelChange || hasCodexServiceTierChange) {
                this.applySessionConfig(sessionId, {
                    ...(options?.model !== undefined ? { model: options.model } : {}),
                    ...(options?.codexServiceTier !== undefined ? { codexServiceTier: options.codexServiceTier } : {}),
                })
                return this.getSession(sessionId) ?? updatedSession
            }

            return updatedSession
        }

        if (hasModelChange || hasCodexServiceTierChange) {
            this.applySessionConfig(sessionId, {
                ...(options?.model !== undefined ? { model: options.model } : {}),
                ...(options?.codexServiceTier !== undefined ? { codexServiceTier: options.codexServiceTier } : {}),
            })
            return this.getSession(sessionId) ?? session
        }

        return session
    }
}
