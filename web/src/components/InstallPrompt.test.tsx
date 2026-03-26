import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PWAInstallState } from '@/hooks/usePWAInstall'
import { I18nProvider } from '@/lib/i18n-context'
import { preloadI18nForTests, renderWithI18n } from '@/test/i18n'
import { InstallPrompt } from './InstallPrompt'

const promptInstallMock = vi.fn<() => Promise<boolean>>()
const dismissInstallMock = vi.fn()
const impactMock = vi.fn()
const notificationMock = vi.fn()

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: vi.fn()
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: true,
        haptic: {
            impact: impactMock,
            notification: notificationMock,
            selection: vi.fn()
        }
    })
}))

async function renderInstallPrompt(props?: { suppressed?: boolean }) {
    return renderWithI18n(<InstallPrompt {...props} />)
}

function createPWAInstallState(overrides?: Partial<PWAInstallState>): PWAInstallState {
    return {
        installPlatform: 'native',
        isStandalone: false,
        promptInstall: promptInstallMock,
        dismissInstall: dismissInstallMock,
        ...overrides
    }
}

describe('InstallPrompt', () => {
    afterEach(() => {
        cleanup()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        window.localStorage.clear()
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(createPWAInstallState())
        promptInstallMock.mockResolvedValue(true)
    })

    it('renders native install copy in English and triggers the browser prompt', async () => {
        window.localStorage.setItem('viby-lang-preference', 'en')

        await renderInstallPrompt()

        expect(screen.getByText('Install Viby')).toBeInTheDocument()
        expect(screen.getByText('Quick launch')).toBeInTheDocument()
        expect(screen.getByText('Installable')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Install' }))

        expect(promptInstallMock).toHaveBeenCalledTimes(1)
        expect(impactMock).toHaveBeenCalled()
    })

    it('renders localized iOS manual-install steps in Chinese', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(createPWAInstallState({
            installPlatform: 'ios'
        }))

        await renderInstallPrompt()

        expect(await screen.findByText('安装 Viby')).toBeInTheDocument()
        expect(screen.getByText('快捷启动')).toBeInTheDocument()
        expect(screen.getByText('iPhone / iPad')).toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: '查看步骤' }))

        expect(screen.getByText('先打开分享菜单')).toBeInTheDocument()
        expect(screen.getByText('选择“添加到主屏幕”')).toBeInTheDocument()
        expect(screen.getByText('确认名称并添加')).toBeInTheDocument()
    })

    it('dismisses the banner through the shared dismiss action', async () => {
        window.localStorage.setItem('viby-lang-preference', 'en')

        await renderInstallPrompt()

        fireEvent.click(screen.getByTestId('install-banner-dismiss'))

        expect(dismissInstallMock).toHaveBeenCalledTimes(1)
    })

    it('does not render when the app temporarily suppresses install chrome', async () => {
        await renderInstallPrompt({ suppressed: true })

        expect(screen.queryByText('Install Viby')).not.toBeInTheDocument()
    })

    it('closes the iOS guide when the app temporarily suppresses install chrome', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(createPWAInstallState({
            installPlatform: 'ios'
        }))
        await preloadI18nForTests()

        const { rerender } = render(
            <I18nProvider>
                <InstallPrompt />
            </I18nProvider>
        )

        fireEvent.click(await screen.findByRole('button', { name: '查看步骤' }))
        expect(await screen.findByText('先打开分享菜单')).toBeInTheDocument()

        rerender(
            <I18nProvider>
                <InstallPrompt suppressed />
            </I18nProvider>
        )

        expect(screen.queryByText('先打开分享菜单')).not.toBeInTheDocument()
    })
})
