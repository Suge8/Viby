import type { SyncEvent } from '@/types/api'

type ToastEvent = Extract<SyncEvent, { type: 'toast' }>

type TranslationFn = (key: string, params?: Record<string, string | number>) => string

type ToastNoticePresentation = {
    title: string
    description: string
}

export function presentToastEvent(event: ToastEvent, t: TranslationFn): ToastNoticePresentation {
    if (event.data.kind === 'permission-request') {
        return {
            title: t('notice.toast.permission.title'),
            description: t('notice.toast.permission.description', {
                session: event.data.sessionName ?? event.data.title,
                tool: event.data.toolName ?? t('notice.toast.permission.toolFallback')
            })
        }
    }

    if (event.data.kind === 'ready') {
        return {
            title: t('notice.toast.ready.title'),
            description: t('notice.toast.ready.description', {
                agent: event.data.agentName ?? t('notice.toast.ready.agentFallback'),
                session: event.data.sessionName ?? event.data.title
            })
        }
    }

    return {
        title: event.data.title,
        description: event.data.body
    }
}
