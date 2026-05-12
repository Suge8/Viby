import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nContext } from '@/lib/i18n-context'
import zhCN from '@/lib/locales/zh-CN'
import { LoginPrompt, type LoginPromptServerConfig } from './LoginPrompt'

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: vi.fn(),
}))

vi.mock('@/api/authClient', () => ({
    authenticateWithPairingCode: vi.fn(),
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
            <LoginPrompt server={server} onLogin={vi.fn()} />
        </I18nContext.Provider>
    )
}

describe('LoginPrompt', () => {
    it('renders the operational access shell around the sign-in form', () => {
        renderPrompt()

        expect(screen.getByTestId('login-access-shell')).toBeInTheDocument()
        expect(screen.queryByText('Agent 留在你的机器上。')).not.toBeInTheDocument()
        expect(screen.queryByText(/Vibe Coding/)).not.toBeInTheDocument()
        expect(screen.queryByRole('link', { name: '查看 GitHub 项目' })).not.toBeInTheDocument()
        expect(screen.queryByText('Viby')).not.toBeInTheDocument()
        expect(screen.queryByText('电脑配对码')).not.toBeInTheDocument()
        expect(screen.getByLabelText('输入配对码')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '进入' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Hub/ })).not.toBeInTheDocument()
    })

    it('shows hub settings only when a separate hub origin is required', () => {
        renderPrompt({ ...createServerConfig(), requireServerUrl: true })

        expect(screen.getByRole('button', { name: /Hub/ })).toBeInTheDocument()
    })
})
