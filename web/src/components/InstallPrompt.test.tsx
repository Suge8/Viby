import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PWAInstallState } from '@/hooks/usePWAInstall'
import { I18nProvider } from '@/lib/i18n-context'
import { preloadI18nForTests, renderWithI18n } from '@/test/i18n'
import { InstallPrompt } from './InstallPrompt'

const promptInstallMock = vi.fn<() => Promise<boolean>>()
const dismissInstallMock = vi.fn()
const impactMock = vi.fn()
const notificationMock = vi.fn()

vi.mock('@/hooks/usePWAInstall', () => ({
    usePWAInstall: vi.fn(),
}))

vi.mock('@/hooks/usePlatform', () => ({
    usePlatform: () => ({
        isTouch: true,
        haptic: {
            impact: impactMock,
            notification: notificationMock,
            selection: vi.fn(),
        },
    }),
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
        ...overrides,
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
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'ios',
            })
        )

        await renderInstallPrompt()

        expect(await screen.findByText('安装 Viby')).toBeInTheDocument()
        expect(screen.getByText('快捷启动')).toBeInTheDocument()
        expect(screen.getByText('iPhone / iPad')).toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: '查看步骤' }))

        expect(await screen.findByRole('dialog', { name: '安装 Viby' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '查看步骤' })).not.toBeInTheDocument()
        expect(screen.getByText('先打开分享菜单')).toBeInTheDocument()
        expect(screen.getByText('选择“添加到主屏幕”')).toBeInTheDocument()
        expect(screen.getByText('确认名称并添加')).toBeInTheDocument()
    })

    it('renders LAN HTTP shortcut limits without pretending full PWA support', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'shortcut',
            })
        )

        await renderInstallPrompt()

        expect(await screen.findByText('添加 Viby 快捷方式')).toBeInTheDocument()
        expect(screen.getByText('仅快捷方式')).toBeInTheDocument()
        expect(
            screen.getByText('当前 HTTP 页面只能保存为快捷方式。完整提醒能力请用 HTTPS 或公网入口。')
        ).toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: '查看步骤' }))

        expect(await screen.findByRole('dialog', { name: '添加 Viby 快捷方式' })).toBeInTheDocument()
        expect(screen.getByText('打开浏览器菜单')).toBeInTheDocument()
        expect(screen.getByText('注意能力边界')).toBeInTheDocument()
    })

    it('renders dedicated macOS Safari Add to Dock guidance', async () => {
        window.localStorage.setItem('viby-lang-preference', 'en')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'desktop-safari',
            })
        )

        await renderInstallPrompt()

        expect(await screen.findByText('Safari on Mac')).toBeInTheDocument()
        expect(screen.getByText('Use Safari Add to Dock for a standalone Viby app on this Mac.')).toBeInTheDocument()

        fireEvent.click(await screen.findByRole('button', { name: 'Show steps' }))

        expect(await screen.findByRole('dialog', { name: 'Install Viby' })).toBeInTheDocument()
        expect(screen.getByText('Open Safari File menu')).toBeInTheDocument()
        expect(screen.getByText('Choose Add to Dock')).toBeInTheDocument()
    })

    it('dismisses the banner through the shared dismiss action', async () => {
        window.localStorage.setItem('viby-lang-preference', 'en')

        await renderInstallPrompt()

        fireEvent.click(screen.getByTestId('install-banner-dismiss'))

        expect(dismissInstallMock).toHaveBeenCalledTimes(1)
    })

    it('closes the iOS guide through the visible close button', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'ios',
            })
        )

        await renderInstallPrompt()
        fireEvent.click(await screen.findByRole('button', { name: '查看步骤' }))
        fireEvent.click(await screen.findByTestId('install-guide-close'))

        expect(screen.queryByRole('dialog', { name: '安装 Viby' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: '查看步骤' })).toBeInTheDocument()
    })

    it('traps guide focus and restores the trigger after Escape', async () => {
        window.localStorage.setItem('viby-lang-preference', 'en')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'ios',
            })
        )

        await renderInstallPrompt()
        const trigger = await screen.findByRole('button', { name: 'Show steps' })
        trigger.focus()
        fireEvent.click(trigger)

        expect(await screen.findByRole('dialog', { name: 'Install Viby' })).toBeInTheDocument()
        expect(await screen.findByTestId('install-guide-close')).toHaveFocus()

        fireEvent.keyDown(document, { key: 'Escape' })

        expect(screen.queryByRole('dialog', { name: 'Install Viby' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Show steps' })).toHaveFocus()
    })

    it('does not render when the app temporarily suppresses install chrome', async () => {
        await renderInstallPrompt({ suppressed: true })

        expect(screen.queryByText('Install Viby')).not.toBeInTheDocument()
    })

    it('closes the iOS guide when the app temporarily suppresses install chrome', async () => {
        window.localStorage.setItem('viby-lang-preference', 'zh-CN')
        const { usePWAInstall } = await import('@/hooks/usePWAInstall')
        vi.mocked(usePWAInstall).mockReturnValue(
            createPWAInstallState({
                installPlatform: 'ios',
            })
        )
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
