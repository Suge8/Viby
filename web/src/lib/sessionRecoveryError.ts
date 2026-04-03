import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

type TranslationFn = (key: string) => string

const SESSION_RECOVERY_FALLBACK_KEY = 'chat.resumeFailed.generic'
const SESSION_RECOVERY_CODE_MAP = {
    session_archived: 'chat.resumeFailed.sessionArchived',
    resume_unavailable: 'chat.resumeFailed.resumeUnavailable',
    no_machine_online: 'chat.resumeFailed.noMachineOnline',
    session_not_found: 'chat.resumeFailed.sessionNotFound',
    resume_failed: 'chat.resumeFailed.resumeFailed'
} as const
const SESSION_RECOVERY_MESSAGE_MAP = [{
    match: 'Resume session ID unavailable',
    key: 'chat.resumeFailed.resumeUnavailable'
}] as const

export function formatSessionRecoveryErrorMessage(error: unknown, t: TranslationFn): string {
    return formatUserFacingErrorMessage(error, {
        t,
        fallbackKey: SESSION_RECOVERY_FALLBACK_KEY,
        codeMap: SESSION_RECOVERY_CODE_MAP,
        messageMap: SESSION_RECOVERY_MESSAGE_MAP
    })
}
