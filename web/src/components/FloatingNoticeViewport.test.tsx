import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { NoticeProvider, usePersistentNotices } from '@/lib/notice-center'
import { APP_OVERLAY_ROOT_ELEMENT_ID } from '@/lib/overlayRoot'
import { PERSISTENT_NOTICE_IDS } from '@/lib/persistentNoticePresentation'

vi.mock('@/components/ui/animated-list', () => ({
    AnimatedList: (props: { children: ReactNode; className?: string }) => (
        <div className={props.className}>{props.children}</div>
    ),
}))

vi.mock('@/components/ui/blur-fade', () => ({
    BlurFade: (props: { children: ReactNode; className?: string }) => (
        <div className={props.className}>{props.children}</div>
    ),
}))

vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
}))

function PersistentNoticeHost(): null {
    usePersistentNotices([
        {
            id: PERSISTENT_NOTICE_IDS.runtime,
            tone: 'info',
            title: 'Recovered',
            description: 'Syncing the latest state.',
        },
    ])
    return null
}

function getViewport(): HTMLElement | null {
    return document.getElementById(APP_OVERLAY_ROOT_ELEMENT_ID)?.firstElementChild as HTMLElement | null
}

describe('FloatingNoticeViewport', () => {
    it('renders every notice in the single top-right overlay rail', () => {
        render(
            <NoticeProvider>
                <PersistentNoticeHost />
                <FloatingNoticeViewport />
            </NoticeProvider>
        )

        expect(screen.getByText('Recovered')).toBeInTheDocument()
        const viewport = getViewport()
        expect(viewport).not.toBeNull()
        expect(viewport?.className).toContain(
            'right-[calc(var(--app-safe-area-inset-right)+var(--app-overlay-edge-offset))]'
        )
        expect(viewport?.className).not.toContain('left-1/2')
        expect(viewport?.className).not.toContain('-translate-x-1/2')
        expect(viewport?.className).toContain('w-[min(calc(100vw-2.5rem),20rem)]')
    })

    it('shrinks the rail further when every notice is compact', () => {
        function CompactNoticeHost(): null {
            usePersistentNotices([
                {
                    id: PERSISTENT_NOTICE_IDS.offline,
                    tone: 'warning',
                    title: 'Offline',
                    compact: true,
                },
            ])
            return null
        }

        render(
            <NoticeProvider>
                <CompactNoticeHost />
                <FloatingNoticeViewport />
            </NoticeProvider>
        )

        const viewport = getViewport()
        expect(viewport?.className).toContain('w-[min(calc(100vw-4.25rem),14rem)]')
        expect(viewport?.className).toContain('sm:w-[min(calc(100vw-2rem),16rem)]')
        expect(document.getElementById(APP_OVERLAY_ROOT_ELEMENT_ID)?.querySelector('.space-y-2\\.5')).not.toBeNull()
    })
})
