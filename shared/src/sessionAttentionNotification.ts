import type { WebPushNotificationData } from './webPushNotification'

export type SessionAttentionNotificationKind = 'ready' | 'permission-request'
export type SessionAttentionNotificationTone = 'success' | 'warning'

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

export type SessionAttentionNotificationInput = {
    kind: SessionAttentionNotificationKind
    sessionId: string
    sessionTitle: string
    toolName?: string | null
}

export type SessionAttentionNotificationPresentation = {
    toast: {
        title: string
        description: string
        tone: SessionAttentionNotificationTone
        href: string
    }
    push: {
        title: string
        body: string
        tag: string
        data: WebPushNotificationData
    }
}

const DEFAULT_COPY: Record<string, string> = {
    'notice.toast.ready.title': '回复完成',
    'notice.toast.permission.title': '待审核',
    'notice.toast.session.description': '会话：{session}',
    'notice.toast.session.descriptionWithTool': '会话：{session} · {tool}',
}

function defaultTranslation(key: string, params?: Record<string, string | number>): string {
    const template = DEFAULT_COPY[key] ?? key
    if (!params) {
        return template
    }
    return template.replace(/\{(\w+)\}/g, (match, name) => {
        const value = params[name]
        return value === undefined ? match : String(value)
    })
}

function getTitleKey(kind: SessionAttentionNotificationKind): string {
    return kind === 'ready' ? 'notice.toast.ready.title' : 'notice.toast.permission.title'
}

function getTone(kind: SessionAttentionNotificationKind): SessionAttentionNotificationTone {
    return kind === 'ready' ? 'success' : 'warning'
}

function getPushBody(input: SessionAttentionNotificationInput, t: TranslationFn): string {
    const toolName = input.toolName?.trim()
    if (toolName) {
        return t('notice.toast.session.descriptionWithTool', { session: input.sessionTitle, tool: toolName })
    }
    return t('notice.toast.session.description', { session: input.sessionTitle })
}

export function presentSessionAttentionNotification(
    input: SessionAttentionNotificationInput,
    t: TranslationFn = defaultTranslation
): SessionAttentionNotificationPresentation {
    const title = t(getTitleKey(input.kind))
    const href = `/sessions/${input.sessionId}`
    return {
        toast: {
            title,
            description: t('notice.toast.session.description', { session: input.sessionTitle }),
            tone: getTone(input.kind),
            href,
        },
        push: {
            title,
            body: getPushBody(input, t),
            tag: `${input.kind === 'ready' ? 'ready' : 'permission'}-${input.sessionId}`,
            data: {
                type: input.kind,
                sessionId: input.sessionId,
                url: href,
            },
        },
    }
}
