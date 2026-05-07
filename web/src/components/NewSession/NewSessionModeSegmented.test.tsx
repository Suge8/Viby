import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewSessionModeSegmented } from './NewSessionModeSegmented'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => {
            switch (key) {
                case 'newSession.title':
                    return 'New session'
                case 'newSession.mode.start':
                    return 'Start new'
                case 'newSession.mode.recover':
                    return 'Recover local'
                default:
                    return key
            }
        },
    }),
}))

afterEach(() => {
    cleanup()
})

describe('NewSessionModeSegmented', () => {
    it('marks the active tab via aria-selected', () => {
        render(<NewSessionModeSegmented mode="start" isDisabled={false} onModeChange={() => undefined} />)
        const startTab = screen.getByRole('tab', { name: 'Start new' })
        const recoverTab = screen.getByRole('tab', { name: 'Recover local' })
        expect(startTab).toHaveAttribute('aria-selected', 'true')
        expect(recoverTab).toHaveAttribute('aria-selected', 'false')
    })

    it('uses segmented press feedback without pointer glow', () => {
        render(<NewSessionModeSegmented mode="start" isDisabled={false} onModeChange={() => undefined} />)

        const startTab = screen.getByRole('tab', { name: 'Start new' })
        expect(startTab).toHaveAttribute('data-button-press-style', 'segmented')
        expect(startTab).toHaveAttribute('data-button-pointer-effect', 'none')
        expect(startTab).toHaveStyle({ '--ds-button-press-scale': 'var(--ds-press-scale-segmented)' })
    })

    it('invokes onModeChange when switching to recover', () => {
        const onModeChange = vi.fn()
        render(<NewSessionModeSegmented mode="start" isDisabled={false} onModeChange={onModeChange} />)
        fireEvent.click(screen.getByRole('tab', { name: 'Recover local' }))
        expect(onModeChange).toHaveBeenCalledWith('recover-local')
    })

    it('disables every tab when isDisabled is true', () => {
        render(<NewSessionModeSegmented mode="recover-local" isDisabled onModeChange={() => undefined} />)
        const tabs = screen.getAllByRole('tab')
        for (const tab of tabs) {
            expect(tab).toBeDisabled()
        }
    })
})
