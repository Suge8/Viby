import { render, waitFor } from '@testing-library/react'
import { memo, useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Notice, NoticeProvider, useNoticeCenter, usePersistentNotices } from '@/lib/notice-center'
import { PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'

const probeHarness = vi.hoisted(() => ({
    updates: [] as Notice[][],
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

function ToastBurstHost(): null {
    const { addToast } = useNoticeCenter()

    useEffect(() => {
        for (let index = 1; index <= 4; index += 1) {
            addToast({ title: `toast-${index}`, dismissAfterMs: 0 })
        }
    }, [addToast])

    return null
}

function createNotice(overrides?: Partial<Notice>): Notice {
    return {
        id: PERSISTENT_NOTICE_IDS.runtime,
        tone: 'info',
        title: 'Runtime recovering',
        description: 'Syncing the latest state',
        ...overrides,
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

    it('updates persistent notice actions when the owner changes handlers', async () => {
        const firstAction = vi.fn()
        const secondAction = vi.fn()
        const view = render(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[createNotice({ onPress: firstAction })]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)?.[0]?.onPress).toBe(firstAction)
        })

        view.rerender(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost notices={[createNotice({ onPress: secondAction })]} />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)?.[0]?.onPress).toBe(secondAction)
        })
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

    it('orders persistent notices by the shared priority contract', async () => {
        render(
            <NoticeProvider>
                <NoticeProbe />
                <PersistentNoticeHost
                    notices={[
                        createNotice({ id: PERSISTENT_NOTICE_IDS.runtimeUpdate, title: 'Update ready' }),
                        createNotice({ id: PERSISTENT_NOTICE_IDS.runtime, title: 'Runtime recovering' }),
                        createNotice({ id: PERSISTENT_NOTICE_IDS.offline, title: 'Offline' }),
                        createNotice({
                            id: PERSISTENT_NOTICE_IDS.remotePairingReconnect,
                            title: 'Computer reconnecting',
                        }),
                    ]}
                />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)?.map((notice) => notice.title)).toEqual([
                'Offline',
                'Computer reconnecting',
                'Runtime recovering',
                'Update ready',
            ])
        })
    })

    it('caps transient toasts so the floating rail cannot grow without bound', async () => {
        render(
            <NoticeProvider>
                <NoticeProbe />
                <ToastBurstHost />
            </NoticeProvider>
        )

        await waitFor(() => {
            expect(probeHarness.updates.at(-1)?.map((notice) => notice.title)).toEqual([
                'toast-2',
                'toast-3',
                'toast-4',
            ])
        })
        expect(probeHarness.updates.at(-1)?.every((notice) => notice.compact === true)).toBe(true)
    })
})
