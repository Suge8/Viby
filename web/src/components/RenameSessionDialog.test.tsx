import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/lib/i18n-context'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'

describe('RenameSessionDialog', () => {
    afterEach(() => {
        cleanup()
    })

    it('focuses and selects the rename input when the dialog opens', () => {
        render(
            <I18nProvider>
                <RenameSessionDialog
                    isOpen
                    onClose={vi.fn()}
                    currentName="Smoke Alpha"
                    onRename={vi.fn(async () => {})}
                    isPending={false}
                />
            </I18nProvider>
        )

        const input = screen.getByRole('textbox')

        expect(input).toHaveFocus()
        expect(input).toHaveValue('Smoke Alpha')
    })
})
