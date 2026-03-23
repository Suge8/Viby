import { memo, useEffect } from 'react'
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    NoticeProvider,
    useNoticeCenter,
    usePersistentNotices,
    type Notice
} from '@/lib/notice-center'

const probeHarness = vi.hoisted(() => ({
    updates: [] as Notice[][]
}))

const NoticeProbe = memo(function NoticeProbe(): null {
    const { notices } = useNoticeCenter()

    useEffect(() => {
        probeHarness.updates.push(notices)
    }, [notices])

    return null
})

function PersistentNoticeHost(props: { notices: readonly Notice[] }): null {
    usePersistentNotices(props.notices)
    return null
}

function createNotice(overrides?: Partial<Notice>): Notice {
    return {
        id: 'app:runtime',
        tone: 'info',
        title: 'Runtime recovering',
        description: 'Syncing the latest state',
        ...overrides
    }
}

describe('notice-center persistent notices', () => {
    afterEach(() => {
        probeHarness.updates = []
    })

    it('does not publish a new notice list when a persistent notice keeps the same semantics', async () => {
        const firstNotice = createNotice()
        const view = render(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[firstNotice]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates).toHaveLength(2)
        })

        const stableNotices = probeHarness.updates[1]

        view.rerender(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[createNotice()]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates).toHaveLength(2)
        })

        expect(probeHarness.updates[1]).toBe(stableNotices)
    })

    it('clears removed persistent notices from the shared rail', async () => {
        const view = render(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[createNotice()]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)).toHaveLength(1)
        })

        view.rerender(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)).toEqual([])
        })
    })
})
