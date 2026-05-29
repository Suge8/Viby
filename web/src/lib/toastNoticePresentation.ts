import type { SyncEvent } from '@/types/api'

type ToastEvent = Extract<SyncEvent, { type: 'toast' }>

type ToastNoticePresentation = {
    title: string
    description: string
}

export function presentToastEvent(event: ToastEvent): ToastNoticePresentation {
    return {
        title: event.data.title,
        description: event.data.body,
    }
}
