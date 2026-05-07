import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TEST_RUNTIME_PROJECT_PATH } from '@/test/sessionFactories'
import { ProjectPickerDirectoryList } from './ProjectPickerDirectoryList'

const ENTRIES = [
    {
        name: 'viby',
        path: TEST_RUNTIME_PROJECT_PATH,
        type: 'directory' as const,
    },
]

describe('ProjectPickerDirectoryList', () => {
    it('uses subtle card press feedback without pointer glow', () => {
        render(<ProjectPickerDirectoryList entries={ENTRIES} isDisabled={false} onBrowse={vi.fn()} />)

        const row = screen.getByRole('button', { name: /viby/i })
        expect(row).toHaveAttribute('data-button-press-style', 'list-row')
        expect(row).toHaveAttribute('data-button-pointer-effect', 'none')
        expect(row).toHaveStyle({ '--ds-button-press-scale': 'var(--ds-press-scale-list-row)' })
    })

    it('shows parent path context without expanding row width', () => {
        render(<ProjectPickerDirectoryList entries={ENTRIES} isDisabled={false} onBrowse={vi.fn()} />)

        expect(screen.getByText('/tmp/viby-test/home/projects')).toBeInTheDocument()
    })

    it('opens the selected directory path', () => {
        const onBrowse = vi.fn()
        render(<ProjectPickerDirectoryList entries={ENTRIES} isDisabled={false} onBrowse={onBrowse} />)

        fireEvent.click(screen.getByRole('button', { name: /viby/i }))

        expect(onBrowse).toHaveBeenCalledWith(TEST_RUNTIME_PROJECT_PATH)
    })
})
