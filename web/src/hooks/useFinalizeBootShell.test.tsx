import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'

const finalizeBootShellMock = vi.fn()

vi.mock('@/lib/appRecovery', () => ({
    finalizeBootShell: () => finalizeBootShellMock()
}))

function Harness(props: { when?: boolean }): React.JSX.Element {
    useFinalizeBootShell(props.when)
    return <div>ready</div>
}

describe('useFinalizeBootShell', () => {
    afterEach(() => {
        finalizeBootShellMock.mockReset()
    })

    it('finalizes the boot shell when enabled', () => {
        render(<Harness when />)

        expect(finalizeBootShellMock).toHaveBeenCalledTimes(1)
    })

    it('does not finalize the boot shell while disabled', () => {
        render(<Harness when={false} />)

        expect(finalizeBootShellMock).not.toHaveBeenCalled()
    })
})
