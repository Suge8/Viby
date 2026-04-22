import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nContext } from '@/lib/i18n-context'
import zhCN from '@/lib/locales/zh-CN'
import { LoginPrompt, type LoginPromptServerConfig } from './LoginPrompt'

vi.mock('@/hooks/useFinalizeBootShell', () => ({
    useFinalizeBootShell: vi.fn(),
}))

vi.mock('@/api/authClient', () => ({
    authenticateWithAccessToken: vi.fn(),
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

function renderPrompt() {
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
            <LoginPrompt server={createServerConfig()} onLogin={vi.fn()} />
        </I18nContext.Provider>
    )
}

describe('LoginPrompt', () => {
    it('renders the product-style landing shell around the sign-in form', () => {
        renderPrompt()

        expect(screen.getByTestId('login-marketing-shell')).toBeInTheDocument()
        expect(screen.getByText('Agent 留在你的机器上。')).toBeInTheDocument()
        expect(screen.getAllByText('把访问令牌贴进来，直接接上你电脑上正在运行的会话。').length).toBeGreaterThanOrEqual(
            1
        )
        expect(screen.getByRole('link', { name: '查看 GitHub 项目' })).toHaveAttribute(
            'href',
            'https://github.com/Suge8/Viby'
        )
        expect(screen.getByRole('button', { name: '登录' })).toBeInTheDocument()
    })
})
