import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nContext } from '@/lib/i18n-context'
import zhCN from '@/lib/locales/zh-CN'
import { LoginPrompt, type LoginPromptServerConfig } from './LoginPrompt'

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: vi.fn(),
}))

vi.mock('@/lib/notice-center', () => ({
    useNoticeCenter: () => ({ addToast: vi.fn() }),
}))

function createServerConfig(): LoginPromptServerConfig {
    return {
        baseUrl: 'https://viby.example.com',
        serverUrl: null,
        requireServerUrl: false,
        setServerUrl: () => ({ ok: true, value: 'https://viby.example.com' }),
        clearServerUrl: vi.fn(),
    }
}

function renderPrompt(server: LoginPromptServerConfig = createServerConfig()) {
    const translations = zhCN as Record<string, string>
    return render(
        <I18nContext.Provider
            value={{
                locale: 'zh-CN',
                localePreference: 'zh-CN',
                setLocale: vi.fn(),
                t: (key: string) => translations[key] ?? key,
            }}
        >
            <LoginPrompt server={server} />
        </I18nContext.Provider>
    )
}

describe('LoginPrompt', () => {
    it('directs visitors to the desktop invite flow instead of asking for a static code', () => {
        renderPrompt()

        expect(screen.getByTestId('login-access-shell')).toBeInTheDocument()
        // The legacy static-code form is gone; visitors are pointed at the
        // desktop invite flow as the single entry point.
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '进入' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Hub/ })).not.toBeInTheDocument()
    })

    it('shows hub settings only when a separate hub origin is required', () => {
        renderPrompt({ ...createServerConfig(), requireServerUrl: true })

        expect(screen.getByRole('button', { name: /Hub/ })).toBeInTheDocument()
    })
})
