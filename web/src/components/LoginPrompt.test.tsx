import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { LoginPrompt } from './LoginPrompt'

const loginServer = {
    baseUrl: 'https://app.example.com',
    serverUrl: null,
    setServerUrl: vi.fn((value: string) => ({ ok: true as const, value })),
    clearServerUrl: vi.fn()
}

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('LoginPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.localStorage.clear()
        window.localStorage.setItem('viby-lang', 'en')
        loginServer.serverUrl = null
    })

    afterEach(() => {
        window.localStorage.clear()
    })

    it('does not clear first hub URL edit when hub URL required', async () => {
        const { container } = renderWithProviders(
            <LoginPrompt
                server={{
                    ...loginServer,
                    requireServerUrl: true
                }}
                onLogin={vi.fn()}
            />
        )

        const tokenInput = container.querySelector<HTMLInputElement>('input[name="accessToken"]')
        const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]')

        expect(tokenInput).not.toBeNull()
        expect(submitButton).not.toBeNull()

        fireEvent.change(tokenInput!, { target: { value: 'token' } })
        fireEvent.click(submitButton!)

        const dialog = await screen.findByRole('dialog')
        const hubInput = within(dialog).getByRole('textbox')

        fireEvent.change(hubInput, { target: { value: 'https://hub.example.com' } })

        expect(hubInput).toHaveValue('https://hub.example.com')
    })

    it('marks the access token field as a non-autofill secret input', () => {
        const { container } = renderWithProviders(
            <LoginPrompt
                server={loginServer}
                onLogin={vi.fn()}
            />
        )

        const tokenInput = container.querySelector<HTMLInputElement>('input[name="accessToken"]')
        expect(tokenInput).not.toBeNull()

        expect(tokenInput).toHaveAttribute('name', 'accessToken')
        expect(tokenInput).toHaveAttribute('autocomplete', 'new-password')
        expect(tokenInput).toHaveAttribute('autocapitalize', 'none')
        expect(tokenInput).toHaveAttribute('autocorrect', 'off')
        expect(tokenInput).toHaveAttribute('spellcheck', 'false')
        expect(tokenInput).toHaveAttribute('inputmode', 'text')
        expect(tokenInput).toHaveAttribute('data-1p-ignore', 'true')
        expect(tokenInput).toHaveAttribute('data-lpignore', 'true')
    })
})
