import type { Suggestion } from '@/hooks/useActiveSuggestions'

export type ComposerAttachment = {
    status: { type: string }
    path?: string
}

export const DEFAULT_AUTOCOMPLETE_PREFIXES = ['@', '/', '$'] as const
const TOUCH_COMPOSER_ENTER_KEY_HINT = 'enter'
const DESKTOP_COMPOSER_ENTER_KEY_HINT = 'send'

export function defaultSuggestionHandler(): Promise<Suggestion[]> {
    return Promise.resolve([])
}

export function getComposerEnterKeyHint(isTouch: boolean): 'enter' | 'send' {
    if (isTouch) {
        return TOUCH_COMPOSER_ENTER_KEY_HINT
    }

    return DESKTOP_COMPOSER_ENTER_KEY_HINT
}

export function getComposerPlaceholder(options: {
    isReadonlyHistory: boolean
    showResumePlaceholder: boolean
    t: (key: string) => string
}): string {
    if (options.isReadonlyHistory) {
        return options.t('misc.readonlyHistoryMessage')
    }
    if (options.showResumePlaceholder) {
        return options.t('misc.resumeMessage')
    }
    return options.t('misc.typeAMessage')
}

function isAttachmentReady(attachment: ComposerAttachment): boolean {
    if (attachment.status.type === 'complete') {
        return true
    }

    if (attachment.status.type !== 'requires-action') {
        return false
    }

    return typeof attachment.path === 'string' && attachment.path.length > 0
}

export function areAttachmentsReady(attachments: readonly ComposerAttachment[]): boolean {
    return attachments.length === 0 || attachments.every(isAttachmentReady)
}
