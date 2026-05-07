import type { ReactNode } from 'react'
import type { Notice } from '@/lib/notice-center'

export const PERSISTENT_NOTICE_IDS = {
    offline: 'app:offline',
    runtime: 'app:runtime',
    runtimeUpdate: 'app:runtime-update',
    remotePairingReconnect: 'pairing:remote-reconnecting',
} as const

type PersistentNoticeId = (typeof PERSISTENT_NOTICE_IDS)[keyof typeof PERSISTENT_NOTICE_IDS]

const DEFAULT_NOTICE_PRIORITY = 1_000
const NOTICE_PRIORITY_BY_ID: Record<PersistentNoticeId, number> = {
    [PERSISTENT_NOTICE_IDS.offline]: 10,
    [PERSISTENT_NOTICE_IDS.remotePairingReconnect]: 20,
    [PERSISTENT_NOTICE_IDS.runtime]: 30,
    [PERSISTENT_NOTICE_IDS.runtimeUpdate]: 40,
}

type CompactPersistentNoticeOptions = {
    id: PersistentNoticeId
    title: ReactNode
    description?: ReactNode
    tone?: Notice['tone']
    icon?: ReactNode
    onPress?: Notice['onPress']
}

export function getPersistentNoticePriority(id: string): number {
    return NOTICE_PRIORITY_BY_ID[id as PersistentNoticeId] ?? DEFAULT_NOTICE_PRIORITY
}

export function compareNoticePriority(left: Notice, right: Notice): number {
    const priorityDelta =
        (left.priority ?? getPersistentNoticePriority(left.id)) -
        (right.priority ?? getPersistentNoticePriority(right.id))
    return priorityDelta === 0 ? left.id.localeCompare(right.id) : priorityDelta
}

export function buildCompactPersistentNotice(options: CompactPersistentNoticeOptions): Notice {
    return {
        id: options.id,
        tone: options.tone,
        icon: options.icon,
        title: options.title,
        description: options.description,
        compact: true,
        priority: getPersistentNoticePriority(options.id),
        onPress: options.onPress,
    }
}
