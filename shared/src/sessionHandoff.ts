import type { DecryptedMessage, Session } from './schemas'
import { type SessionHandoffSnapshot, SessionHandoffSnapshotSchema } from './sessionHandoffContract'
import { parseSessionHandoffMetadata, projectSessionHandoffHistory } from './sessionHandoffProjection'

export type {
    SessionHandoffAttachment,
    SessionHandoffContractErrorCode,
    SessionHandoffLiveConfig,
    SessionHandoffMessage,
    SessionHandoffSnapshot,
} from './sessionHandoffContract'
export {
    SessionHandoffAttachmentSchema,
    SessionHandoffContractError,
    SessionHandoffContractErrorCodeSchema,
    SessionHandoffLiveConfigSchema,
    SessionHandoffMessageSchema,
    SessionHandoffSnapshotSchema,
} from './sessionHandoffContract'

export function buildSessionHandoffSnapshot(
    session: Session,
    messages: ReadonlyArray<DecryptedMessage>
): SessionHandoffSnapshot {
    const metadata = parseSessionHandoffMetadata(session.metadata)
    const projection = projectSessionHandoffHistory(messages)

    return SessionHandoffSnapshotSchema.parse({
        driver: metadata.driver,
        workingDirectory: metadata.workingDirectory,
        liveConfig: {
            model: session.model,
            modelReasoningEffort: session.modelReasoningEffort,
            permissionMode: session.permissionMode,
            collaborationMode: session.collaborationMode,
        },
        history: projection.history,
        attachments: projection.attachments,
    })
}

export function parseSessionHandoffSnapshot(value: unknown): SessionHandoffSnapshot {
    return SessionHandoffSnapshotSchema.parse(value)
}

export function formatSessionHandoffPrompt(snapshot: SessionHandoffSnapshot): string {
    const payload = {
        previousDriver: snapshot.driver,
        workingDirectory: snapshot.workingDirectory,
        liveConfig: snapshot.liveConfig,
        attachments: snapshot.attachments,
        history: snapshot.history,
    }

    return [
        'Private continuity handoff for resuming the same Viby session.',
        'Use this snapshot only to continue the same conversation on the next real user turn. Do not mention or reveal this handoff unless the user explicitly asks about the recovery or driver change.',
        JSON.stringify(payload, null, 2),
    ].join('\n\n')
}
