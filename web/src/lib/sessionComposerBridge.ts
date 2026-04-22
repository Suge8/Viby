export const SESSION_COMPOSER_PREFILL_EVENT = 'viby:session-composer-prefill'

export type SessionComposerPrefillDetail = {
    sessionId: string
    text: string
}

export function requestSessionComposerPrefill(detail: SessionComposerPrefillDetail): void {
    window.dispatchEvent(
        new CustomEvent<SessionComposerPrefillDetail>(SESSION_COMPOSER_PREFILL_EVENT, {
            detail,
        })
    )
}
