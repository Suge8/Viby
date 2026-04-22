import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FloatingNoticeViewport } from '@/components/FloatingNoticeViewport'
import { NoticeProvider, usePersistentNotices } from '@/lib/notice-center'

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
            id: 'app:runtime',
            tone: 'info',
            title: 'Recovered',
            description: 'Syncing the latest state.',
        },
    ])
    return null
}

describe('FloatingNoticeViewport', () => {
    it('uses a narrower centered mobile rail and keeps the desktop right rail classes', () => {
        const { container } = render(
            <NoticeProvider>
                <PersistentNoticeHost />
                <FloatingNoticeViewport />
            </NoticeProvider>
        )

        expect(screen.getByText('Recovered')).toBeInTheDocument()
        const viewport = container.firstElementChild as HTMLElement
        expect(viewport.className).toContain('left-1/2')
        expect(viewport.className).toContain('-translate-x-1/2')
        expect(viewport.className).toContain('w-[min(calc(100vw-2.5rem),20rem)]')
        expect(viewport.className).toContain('sm:right-3')
        expect(viewport.className).toContain('sm:translate-x-0')
    })

    it('shrinks the rail further when every notice is compact', () => {
        function CompactNoticeHost(): null {
            usePersistentNotices([
                {
                    id: 'app:offline',
                    tone: 'warning',
                    title: 'Offline',
                    compact: true,
                },
            ])
            return null
        }

        const { container } = render(
            <NoticeProvider>
                <CompactNoticeHost />
                <FloatingNoticeViewport />
            </NoticeProvider>
        )

        const viewport = container.firstElementChild as HTMLElement
        expect(viewport.className).toContain('w-[min(calc(100vw-4.25rem),14rem)]')
        expect(viewport.className).toContain('sm:w-[min(calc(100vw-2rem),16rem)]')
        expect(container.querySelector('.space-y-2\\.5')).not.toBeNull()
    })
})
