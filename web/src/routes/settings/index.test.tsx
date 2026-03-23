import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nContext, I18nProvider } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import { PROTOCOL_VERSION } from '@viby/protocol'
import SettingsPage from './index'

const usePushNotificationsMock = vi.fn()

// Mock the router hooks
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
    useRouter: () => ({ history: { back: vi.fn() } }),
    useLocation: () => '/settings',
}))

// Mock useFontScale hook
vi.mock('@/hooks/useFontScale', () => ({
    useFontScale: () => ({ fontScale: 1, setFontScale: vi.fn() }),
    getFontScaleOptions: () => [
        { value: 0.875, label: '87.5%' },
        { value: 1, label: '100%' },
        { value: 1.125, label: '112.5%' },
    ],
}))

// Mock useTheme hook
vi.mock('@/hooks/useTheme', () => ({
    useAppearance: () => ({ appearance: 'system', setAppearance: vi.fn() }),
    getAppearanceOptions: () => [
        { value: 'system', labelKey: 'settings.display.appearance.system' },
        { value: 'dark', labelKey: 'settings.display.appearance.dark' },
        { value: 'light', labelKey: 'settings.display.appearance.light' },
    ],
}))

vi.mock('@/components/ui/blur-fade', () => ({
    BlurFade: (props: { children: React.ReactNode }) => <div>{props.children}</div>
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: {} as object,
        token: 'session-token',
        baseUrl: 'https://app.viby.run'
    })
}))

vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: () => usePushNotificationsMock()
}))

vi.mock('@/hooks/useStandaloneDisplayMode', () => ({
    useStandaloneDisplayMode: () => true
}))

vi.mock('@/hooks/usePWAInstall', () => ({
    isIOSSafariBrowser: () => false
}))

vi.mock('@/lib/runtimeAssetRecovery', () => ({
    shouldRegisterServiceWorkerForOrigin: () => true
}))

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

function renderWithSpyT(ui: React.ReactElement) {
    const translations = en as Record<string, string>
    const spyT = vi.fn((key: string) => translations[key] ?? key)
    render(
        <I18nContext.Provider value={{ t: spyT, locale: 'en', localePreference: 'system', setLocale: vi.fn() }}>
            {ui}
        </I18nContext.Provider>
    )
    return spyT
}

describe('SettingsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        window.localStorage.clear()
        window.localStorage.setItem('viby-lang-preference', 'system')
        usePushNotificationsMock.mockReturnValue({
            isSupported: true,
            isSubscribed: false,
            permission: 'default',
            isPending: false,
            enableNotifications: vi.fn(),
            disableNotifications: vi.fn(),
            refreshSubscription: vi.fn(),
        })
    })

    afterEach(() => {
        window.localStorage.clear()
    })

    it('renders the About section', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getByText('About')).toBeInTheDocument()
    })

    it('displays the App Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('App Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(__APP_VERSION__).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the Protocol Version with correct value', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Protocol Version').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText(String(PROTOCOL_VERSION)).length).toBeGreaterThanOrEqual(1)
    })

    it('uses correct i18n keys for About section', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.about.title')
        expect(calledKeys).toContain('settings.about.appVersion')
        expect(calledKeys).toContain('settings.about.protocolVersion')
    })

    it('renders the Appearance setting', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.getAllByText('Appearance').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Follow System').length).toBeGreaterThanOrEqual(1)
    })

    it('uses correct i18n keys for Appearance setting', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.display.appearance')
        expect(calledKeys).toContain('settings.display.appearance.system')
    })

    it('uses the stage shell layout for full-width settings content', () => {
        const { container } = renderWithProviders(<SettingsPage />)
        expect(container.firstElementChild).toHaveClass('h-full', 'overflow-y-auto')
        expect(container.firstElementChild?.firstElementChild).toHaveClass('ds-stage-shell')
        expect(container.firstElementChild?.firstElementChild).not.toHaveClass('ds-page-shell')
    })

    it('does not render the old settings subtitle hero copy', () => {
        renderWithProviders(<SettingsPage />)
        expect(screen.queryByText('Personalize Viby for your screen, theme, and reading comfort.')).not.toBeInTheDocument()
    })

    it('renders the notifications section with an explicit enable action', () => {
        renderWithProviders(<SettingsPage />)

        expect(screen.getAllByText('Notifications').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByText('Push Notifications').length).toBeGreaterThanOrEqual(1)
        expect(screen.getAllByRole('button', { name: 'Turn On' }).length).toBeGreaterThanOrEqual(1)
    })
})
