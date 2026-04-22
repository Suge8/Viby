import type { CodexCollaborationMode, PermissionMode, Session } from '@viby/protocol/types'
import type { Store } from '../store'
import type { SessionDurableConfigPatch } from './sessionPayloadTypes'

type SessionLookup = (sessionId: string) => Session | null | undefined
type EmitSessionUpdate = (sessionId: string, session: Session) => void

function assertPersistedConfigValue<T>(updated: boolean, persisted: T, expected: T, message: string): void {
    if (!updated && persisted !== expected) {
        throw new Error(message)
    }
}

export class SessionConfigMutationService {
    constructor(
        private readonly store: Store,
        private readonly getSession: SessionLookup,
        private readonly emitSessionUpdate: EmitSessionUpdate
    ) {}

    applySessionConfig(sessionId: string, config: SessionDurableConfigPatch): void {
        const session = this.getSession(sessionId)
        if (!session) {
            return
        }

        this.applyPermissionMode(sessionId, session, config.permissionMode)
        this.applyModel(sessionId, session, config.model)
        this.applyModelReasoningEffort(sessionId, session, config.modelReasoningEffort)
        this.applyCollaborationMode(sessionId, session, config.collaborationMode)

        this.emitSessionUpdate(sessionId, session)
    }

    private applyPermissionMode(sessionId: string, session: Session, permissionMode: PermissionMode | undefined): void {
        if (permissionMode === undefined) {
            return
        }

        const updated = this.store.sessions.setSessionPermissionMode(sessionId, permissionMode)
        const persisted = this.store.sessions.getSession(sessionId)?.permissionMode ?? null
        assertPersistedConfigValue(updated, persisted, permissionMode, 'Failed to update session permission mode')
        session.permissionMode = permissionMode
    }

    private applyModel(sessionId: string, session: Session, model: string | null | undefined): void {
        if (model === undefined) {
            return
        }
        if (model !== session.model) {
            const updated = this.store.sessions.setSessionModel(sessionId, model, {
                touchUpdatedAt: false,
            })
            if (!updated) {
                throw new Error('Failed to update session model')
            }
        }
        session.model = model
    }

    private applyModelReasoningEffort(
        sessionId: string,
        session: Session,
        modelReasoningEffort: Session['modelReasoningEffort'] | undefined
    ): void {
        if (modelReasoningEffort === undefined) {
            return
        }
        if (modelReasoningEffort !== session.modelReasoningEffort) {
            const updated = this.store.sessions.setSessionModelReasoningEffort(sessionId, modelReasoningEffort, {
                touchUpdatedAt: false,
            })
            if (!updated) {
                throw new Error('Failed to update session model reasoning effort')
            }
        }
        session.modelReasoningEffort = modelReasoningEffort
    }

    private applyCollaborationMode(
        sessionId: string,
        session: Session,
        collaborationMode: CodexCollaborationMode | null | undefined
    ): void {
        if (collaborationMode === undefined) {
            return
        }

        const updated = this.store.sessions.setSessionCollaborationMode(sessionId, collaborationMode)
        const persisted = this.store.sessions.getSession(sessionId)?.collaborationMode ?? null
        assertPersistedConfigValue(updated, persisted, collaborationMode, 'Failed to update session collaboration mode')
        session.collaborationMode = collaborationMode ?? undefined
    }
}
