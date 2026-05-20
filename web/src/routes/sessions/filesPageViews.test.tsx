import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GitFileRow } from '@/routes/sessions/filesPageViews'

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void
    const promise = new Promise<void>((done) => {
        resolve = done
    })
    return { promise, resolve }
}

describe('filesPageViews', () => {
    it('keeps file-row navigation single-flight while opening a file', async () => {
        const pending = createDeferred()
        const onOpen = vi.fn(() => pending.promise)

        render(
            <GitFileRow
                file={{
                    fileName: 'app.ts',
                    filePath: 'src',
                    fullPath: 'src/app.ts',
                    isStaged: false,
                    linesAdded: 1,
                    linesRemoved: 0,
                    status: 'modified',
                }}
                onOpen={onOpen}
                rootLabel="Project"
                showDivider={false}
            />
        )

        const row = screen.getByRole('button', { name: /app\.ts/i })
        fireEvent.click(row)
        fireEvent.click(row)

        expect(onOpen).toHaveBeenCalledTimes(1)
        expect(row).toBeDisabled()
        expect(row).toHaveAttribute('aria-busy', 'true')

        pending.resolve()
        await waitFor(() => expect(row).not.toBeDisabled())
    })
})
