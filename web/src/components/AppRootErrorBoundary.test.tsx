import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_BOOT_SHELL_ID } from '@/lib/appRecovery'
import { AppRootErrorBoundary } from './AppRootErrorBoundary'

const diagnostics = vi.hoisted(() => ({ report: vi.fn() }))

vi.mock('@/lib/runtimeDiagnostics', () => ({ reportWebRuntimeError: diagnostics.report }))

function Broken(): never {
    throw new Error('render failed')
}

describe('AppRootErrorBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        diagnostics.report.mockClear()
        document.body.innerHTML = `<div id="${APP_BOOT_SHELL_ID}"></div>`
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('shows a reload surface instead of leaving the boot shell visible', () => {
        render(
            <AppRootErrorBoundary>
                <Broken />
            </AppRootErrorBoundary>
        )

        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(document.getElementById(APP_BOOT_SHELL_ID)).toHaveClass('is-hidden')
        expect(diagnostics.report).toHaveBeenCalledWith('App root render failed.', expect.any(Error))
    })
})
