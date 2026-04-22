import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SESSION_LIST_CREATE_BUTTON_TEST_ID } from '@/lib/sessionUiContracts'
import { renderSessionList } from './SessionList.support'

describe('SessionList mobile controls', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(() => {
        window.localStorage.clear()
        document.body.innerHTML = ''
    })

    it('keeps tabs full width and leaves mobile create ownership to the page shell', () => {
        renderSessionList()

        const activeTab = screen.getByRole('tab', { name: /Active/ })
        const historyTab = screen.getByRole('tab', { name: /History/ })

        expect(activeTab.className).toContain('w-full')
        expect(historyTab.className).toContain('w-full')
        expect(screen.queryByTestId(SESSION_LIST_CREATE_BUTTON_TEST_ID)).toBeNull()
    })
})
