import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppNoticeTone } from '@/components/AppNotice'
import { createRandomId } from '@/lib/id'

export type Notice = {
    id: string
    title: ReactNode
    description?: ReactNode
    tone?: AppNoticeTone
    icon?: ReactNode
    compact?: boolean
    href?: string
    onPress?: () => void | Promise<void>
}

type ToastInput = Omit<Notice, 'id'> & {
    dismissAfterMs?: number
}

type NoticeCenterValue = {
    notices: Notice[]
    addToast: (toast: ToastInput) => string
    upsertNotice: (notice: Notice) => void
    clearPersistentNotice: (id: string) => void
    dismissNotice: (id: string) => void
}

const NOTICE_DURATION_MS = 6_000
const EMPTY_NOTICES: readonly Notice[] = Object.freeze([])
const EMPTY_NOTICE_IDS: readonly string[] = Object.freeze([])
const NoticeCenterContext = createContext<NoticeCenterValue | null>(null)

function areNoticesEquivalent(left: Notice, right: Notice): boolean {
    return left.id === right.id
        && left.tone === right.tone
        && left.href === right.href
        && typeof left.onPress === typeof right.onPress
        && typeof left.icon === typeof right.icon
        && left.compact === right.compact
        && left.title === right.title
        && left.description === right.description
}

function upsertById(items: Notice[], nextItem: Notice): Notice[] {
    const index = items.findIndex((item) => item.id === nextItem.id)
    if (index === -1) {
        return [...items, nextItem]
    }

    if (areNoticesEquivalent(items[index], nextItem)) {
        return items
    }

    const nextItems = items.slice()
    nextItems[index] = nextItem
    return nextItems
}

export function NoticeProvider(props: { children: ReactNode }) {
    const [persistentNotices, setPersistentNotices] = useState<Notice[]>([])
    const [toastNotices, setToastNotices] = useState<Notice[]>([])
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    useEffect(() => {
        return () => {
            for (const timer of timersRef.current.values()) {
                clearTimeout(timer)
            }
            timersRef.current.clear()
        }
    }, [])

    const clearToastTimer = useCallback((id: string) => {
        const timer = timersRef.current.get(id)
        if (!timer) {
            return
        }

        clearTimeout(timer)
        timersRef.current.delete(id)
    }, [])

    const clearPersistentNotice = useCallback((id: string) => {
        setPersistentNotices((prev) => prev.filter((notice) => notice.id !== id))
    }, [])

    const dismissNotice = useCallback((id: string) => {
        clearToastTimer(id)
        setPersistentNotices((prev) => prev.filter((notice) => notice.id !== id))
        setToastNotices((prev) => prev.filter((notice) => notice.id !== id))
    }, [clearToastTimer])

    const upsertNotice = useCallback((notice: Notice) => {
        setPersistentNotices((prev) => upsertById(prev, notice))
    }, [])

    const addToast = useCallback((toast: ToastInput) => {
        const { dismissAfterMs = NOTICE_DURATION_MS, ...notice } = toast
        const id = createRandomId()

        setToastNotices((prev) => [...prev, { id, ...notice }])
        if (dismissAfterMs > 0) {
            const timer = setTimeout(() => {
                dismissNotice(id)
            }, dismissAfterMs)
            timersRef.current.set(id, timer)
        }

        return id
    }, [dismissNotice])

    const notices = useMemo(() => {
        return [...persistentNotices, ...toastNotices]
    }, [persistentNotices, toastNotices])

    const value = useMemo<NoticeCenterValue>(() => ({
        notices,
        addToast,
        upsertNotice,
        clearPersistentNotice,
        dismissNotice
    }), [addToast, clearPersistentNotice, dismissNotice, notices, upsertNotice])

    return (
        <NoticeCenterContext.Provider value={value}>
            {props.children}
        </NoticeCenterContext.Provider>
    )
}

export function useNoticeCenter(): NoticeCenterValue {
    const context = useContext(NoticeCenterContext)
    if (!context) {
        throw new Error('useNoticeCenter must be used within NoticeProvider')
    }
    return context
}

export function usePersistentNotice(notice: Notice | null): void {
    usePersistentNotices(notice ? [notice] : EMPTY_NOTICES)
}

export function usePersistentNotices(notices: readonly Notice[]): void {
    const { upsertNotice, clearPersistentNotice } = useNoticeCenter()
    const previousIdsRef = useRef<readonly string[]>(EMPTY_NOTICE_IDS)

    useEffect(() => {
        const nextIds = notices.map((notice) => notice.id)
        const nextIdSet = new Set(nextIds)

        for (const notice of notices) {
            upsertNotice(notice)
        }

        for (const previousId of previousIdsRef.current) {
            if (!nextIdSet.has(previousId)) {
                clearPersistentNotice(previousId)
            }
        }

        previousIdsRef.current = nextIds
    }, [clearPersistentNotice, notices, upsertNotice])

    useEffect(() => {
        return () => {
            for (const previousId of previousIdsRef.current) {
                clearPersistentNotice(previousId)
            }
        }
    }, [clearPersistentNotice])
}
