import {
    buildSessionHandoffSnapshot,
    findNextRecoveryCursor,
    SessionHandoffContractError,
    SESSION_RECOVERY_PAGE_SIZE,
    type DecryptedMessage,
    type Session,
    type SessionHandoffSnapshot,
} from '@viby/protocol'

export type SessionHandoffBuildErrorCode =
    | 'session_id_missing'
    | 'session_not_found'
    | 'transcript_traversal_failed'
    | 'contract_build_failed'

export type SessionHandoffBuildStage =
    | 'session_lookup'
    | 'transcript_traversal'
    | 'contract_validation'

export class SessionHandoffBuildError extends Error {
    readonly code: SessionHandoffBuildErrorCode
    readonly stage: SessionHandoffBuildStage
    readonly sessionId: string
    override readonly cause?: unknown

    constructor(
        message: string,
        options: {
            code: SessionHandoffBuildErrorCode
            stage: SessionHandoffBuildStage
            sessionId: string
            cause?: unknown
        }
    ) {
        super(message)
        this.name = 'SessionHandoffBuildError'
        this.code = options.code
        this.stage = options.stage
        this.sessionId = options.sessionId
        this.cause = options.cause
    }
}

type SessionHandoffServiceOptions = {
    getSession: (sessionId: string) => Session | undefined
    getMessagesAfter: (
        sessionId: string,
        options: { afterSeq: number; limit: number }
    ) => DecryptedMessage[]
}

const INITIAL_RECOVERY_CURSOR = 0

export class SessionHandoffService {
    private readonly getSession
    private readonly getMessagesAfter

    constructor(options: SessionHandoffServiceOptions) {
        this.getSession = options.getSession
        this.getMessagesAfter = options.getMessagesAfter
    }

    buildSessionHandoff(sessionId: string): SessionHandoffSnapshot {
        if (sessionId.trim().length === 0) {
            throw new SessionHandoffBuildError('Session id is required', {
                code: 'session_id_missing',
                stage: 'session_lookup',
                sessionId,
            })
        }

        const session = this.getSession(sessionId)
        if (!session) {
            throw new SessionHandoffBuildError('Session not found', {
                code: 'session_not_found',
                stage: 'session_lookup',
                sessionId,
            })
        }

        const messages = this.readFullTranscript(sessionId)

        try {
            return buildSessionHandoffSnapshot(session, messages)
        } catch (error) {
            if (error instanceof SessionHandoffContractError) {
                throw new SessionHandoffBuildError(
                    `Failed to build session handoff from persisted content (${error.code})`,
                    {
                        code: 'contract_build_failed',
                        stage: 'contract_validation',
                        sessionId,
                        cause: error,
                    }
                )
            }
            throw error
        }
    }

    private readFullTranscript(sessionId: string): DecryptedMessage[] {
        const transcript: DecryptedMessage[] = []
        let afterSeq = INITIAL_RECOVERY_CURSOR

        while (true) {
            const page = this.readTranscriptPage(sessionId, afterSeq)
            transcript.push(...page)

            if (page.length < SESSION_RECOVERY_PAGE_SIZE) {
                return transcript
            }

            const nextAfterSeq = findNextRecoveryCursor(page, afterSeq)
            if (nextAfterSeq <= afterSeq) {
                throw new SessionHandoffBuildError(
                    'Failed to advance the transcript recovery cursor while building the session handoff',
                    {
                        code: 'transcript_traversal_failed',
                        stage: 'transcript_traversal',
                        sessionId,
                    }
                )
            }

            afterSeq = nextAfterSeq
        }
    }

    private readTranscriptPage(sessionId: string, afterSeq: number): DecryptedMessage[] {
        try {
            return this.getMessagesAfter(sessionId, {
                afterSeq,
                limit: SESSION_RECOVERY_PAGE_SIZE,
            })
        } catch (error) {
            throw new SessionHandoffBuildError('Failed to read transcript pages for session handoff', {
                code: 'transcript_traversal_failed',
                stage: 'transcript_traversal',
                sessionId,
                cause: error,
            })
        }
    }
}
