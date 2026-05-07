import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LocalSessionCatalogEntry } from '@/types/api'
import { RecoverLocalPanel } from './RecoverLocalPanel'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        locale: 'en',
        t: (key: string, params?: Record<string, string | number>) => {
            if (key === 'newSession.recover.showing') return `Showing ${params?.shown} of ${params?.total}`
            if (key === 'newSession.recover.showMore') return `Show ${params?.count} more`
            if (key === 'newSession.recover.results') return 'Recoverable local sessions'
            if (key === 'newSession.recover.messages') return 'messages'
            if (key === 'newSession.recover.filter.selectAgent') return 'Choose agent'
            if (key === 'newSession.recover.filter.driver') return 'Agent'
            if (key === 'newSession.recover.searchPlaceholder') return 'Search title or project path'
            return key
        },
    }),
}))

function createSessions(count: number): LocalSessionCatalogEntry[] {
    return Array.from({ length: count }, (_, index) => ({
        driver: 'codex',
        providerSessionId: `provider-${index + 1}`,
        path: '/repo',
        title: `Session ${index + 1}`,
        summary: `Summary ${index + 1}`,
        startedAt: index + 1,
        updatedAt: index + 1,
        messageCount: index + 1,
    }))
}

describe('RecoverLocalPanel', () => {
    it('keeps large local catalogs bounded and reveals more on explicit action', () => {
        render(
            <RecoverLocalPanel
                sessions={createSessions(30)}
                unavailableCapabilities={[]}
                selectedSessionKey={null}
                searchQuery=""
                driverSelection="codex"
                isLoading={false}
                error={null}
                isDisabled={false}
                hasDirectory
                onSearchQueryChange={() => undefined}
                onDriverSelectionChange={() => undefined}
                onSelectSession={() => undefined}
            />
        )

        const list = screen.getByRole('radiogroup', { name: 'Recoverable local sessions' })
        expect(list).toHaveClass('ds-recover-local-scroller', 'overflow-y-auto', 'overscroll-contain')
        expect(screen.getAllByRole('radio')[0]).toHaveAttribute('aria-checked', 'false')
        expect(screen.getByText('Showing 24 of 30')).toBeInTheDocument()
        expect(screen.getByText('Session 24')).toBeInTheDocument()
        expect(screen.queryByText('Summary 1')).not.toBeInTheDocument()
        expect(screen.queryByText('provider-1')).not.toBeInTheDocument()
        expect(screen.getByText('1 messages').closest('span')?.nextElementSibling?.tagName).toBe('TIME')
        expect(screen.queryByText('Session 25')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Show 6 more' }))

        expect(screen.getByText('Showing 30 of 30')).toBeInTheDocument()
        expect(screen.getByText('Session 30')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Show \d+ more/ })).not.toBeInTheDocument()
    })

    it('keeps agent selection as the only pre-scan control', () => {
        render(
            <RecoverLocalPanel
                sessions={[]}
                unavailableCapabilities={[]}
                selectedSessionKey={null}
                searchQuery=""
                driverSelection="none"
                isLoading={false}
                error={null}
                isDisabled={false}
                hasDirectory
                onSearchQueryChange={() => undefined}
                onDriverSelectionChange={() => undefined}
                onSelectSession={() => undefined}
            />
        )

        expect(screen.getByText('Choose agent')).toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Search title or project path')).not.toBeInTheDocument()
        expect(screen.queryByText('newSession.recover.selectAgent')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Agent' }))

        const options = screen.getByRole('group', { name: 'Agent' })
        expect(within(options).queryByText('Choose agent')).not.toBeInTheDocument()
        expect(within(options).getByText('Codex')).toBeInTheDocument()
        expect(within(options).getByText('Codex').closest('button')?.querySelector('img, svg')).not.toBeNull()
    })
})
