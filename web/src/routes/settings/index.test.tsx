import { render, screen } from '@testing-library/react'
import { PROTOCOL_VERSION } from '@viby/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nContext, I18nProvider } from '@/lib/i18n-context'
import { en } from '@/lib/locales'
import SettingsPage from './index'

const usePushNotificationsMock = vi.fn()

// Mock the router hooks
vi.mock('@tanstack/react-router', () => ({
    useNavigate: () => vi.fn(),
    useRouter: () => ({ history: { back: vi.fn() } }),
    useLocation: () => '/sessions/settings',
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
    BlurFade: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({
        api: {} as object,
        token: 'session-token',
        baseUrl: 'https://app.viby.run',
    }),
}))

vi.mock('@/hooks/usePushNotifications', () => ({
    usePushNotifications: () => usePushNotificationsMock(),
}))

const useStandaloneDisplayModeMock = vi.fn(() => true)

vi.mock('@/hooks/useStandaloneDisplayMode', () => ({
    useStandaloneDisplayMode: () => useStandaloneDisplayModeMock(),
}))

const isIOSBrowserMock = vi.fn(() => false)

vi.mock('@/hooks/usePWAInstall', () => ({
    isIOSBrowser: () => isIOSBrowserMock(),
}))

vi.mock('@/lib/runtimeAssetPolicy', () => ({
    shouldRegisterServiceWorkerForOrigin: () => true,
}))

function renderWithProviders(ui: React.ReactElement) {
    return render(<I18nProvider>{ui}</I18nProvider>)
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
        isIOSBrowserMock.mockReturnValue(false)
        useStandaloneDisplayModeMock.mockReturnValue(true)
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

    it('renders the About section', async () => {
        renderWithProviders(<SettingsPage />)
        expect(await screen.findByText('About')).toBeInTheDocument()
    })

    it('displays the App Version with correct value', async () => {
        renderWithProviders(<SettingsPage />)
        expect((await screen.findAllByText('App Version')).length).toBeGreaterThanOrEqual(1)
        expect((await screen.findAllByText(__APP_VERSION__)).length).toBeGreaterThanOrEqual(1)
    })

    it('displays the Protocol Version with correct value', async () => {
        renderWithProviders(<SettingsPage />)
        expect((await screen.findAllByText('Protocol Version')).length).toBeGreaterThanOrEqual(1)
        expect((await screen.findAllByText(String(PROTOCOL_VERSION))).length).toBeGreaterThanOrEqual(1)
    })

    it('uses correct i18n keys for About section', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.about.title')
        expect(calledKeys).toContain('settings.about.appVersion')
        expect(calledKeys).toContain('settings.about.protocolVersion')
    })

    it('renders the Appearance setting', async () => {
        renderWithProviders(<SettingsPage />)
        expect((await screen.findAllByText('Appearance')).length).toBeGreaterThanOrEqual(1)
        expect((await screen.findAllByText('Follow System')).length).toBeGreaterThanOrEqual(1)
    })

    it('uses correct i18n keys for Appearance setting', () => {
        const spyT = renderWithSpyT(<SettingsPage />)
        const calledKeys = spyT.mock.calls.map((call) => call[0])
        expect(calledKeys).toContain('settings.display.appearance')
        expect(calledKeys).toContain('settings.display.appearance.system')
    })

    it('uses the route scroll area as the single scroll owner inside the stage shell', () => {
        renderWithProviders(<SettingsPage />)
        const scrollArea = screen.getByTestId('route-scroll-area')
        expect(scrollArea).toHaveClass('overflow-y-auto')
        expect(scrollArea.firstElementChild).toHaveClass('ds-stage-shell')
        expect(scrollArea.firstElementChild).not.toHaveClass('ds-page-shell')
    })

    it('does not render the old settings subtitle hero copy', () => {
        renderWithProviders(<SettingsPage />)
        expect(
            screen.queryByText('Personalize Viby for your screen, theme, and reading comfort.')
        ).not.toBeInTheDocument()
    })

    it('renders the notifications section as a single toggle row', async () => {
        renderWithProviders(<SettingsPage />)

        expect((await screen.findAllByText('Notifications')).length).toBeGreaterThanOrEqual(1)
        const toggle = await screen.findByRole('switch', { name: 'Approval & Reply Alerts' })
        expect(toggle).not.toBeChecked()
        expect(toggle).not.toBeDisabled()
        expect(screen.getByText('Get a heads-up for approvals and replies')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
    })

    it('asks iOS browser users to install before showing unsupported push status', async () => {
        isIOSBrowserMock.mockReturnValue(true)
        useStandaloneDisplayModeMock.mockReturnValue(false)
        usePushNotificationsMock.mockReturnValue({
            isSupported: false,
            isSubscribed: false,
            permission: 'default',
            isPending: false,
            enableNotifications: vi.fn(),
            disableNotifications: vi.fn(),
            refreshSubscription: vi.fn(),
        })

        renderWithProviders(<SettingsPage />)

        const toggle = await screen.findByRole('switch', { name: 'Approval & Reply Alerts' })
        expect(toggle).toBeDisabled()
        expect(screen.getByText('Add Viby to the Home Screen first')).toBeInTheDocument()
    })

    it('uses concise product copy when notifications are not supported on this entry', async () => {
        usePushNotificationsMock.mockReturnValue({
            isSupported: false,
            isSubscribed: false,
            permission: 'default',
            isPending: false,
            enableNotifications: vi.fn(),
            disableNotifications: vi.fn(),
            refreshSubscription: vi.fn(),
        })

        renderWithProviders(<SettingsPage />)

        const toggle = await screen.findByRole('switch', { name: 'Approval & Reply Alerts' })
        expect(toggle).toBeDisabled()
        expect(screen.getByText('Not available on this entry')).toBeInTheDocument()
        expect(screen.queryByText(/service workers?/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/secure production app/i)).not.toBeInTheDocument()
    })

    it('shows the refresh action only when notifications are blocked', async () => {
        usePushNotificationsMock.mockReturnValue({
            isSupported: true,
            isSubscribed: false,
            permission: 'denied',
            isPending: false,
            enableNotifications: vi.fn(),
            disableNotifications: vi.fn(),
            refreshSubscription: vi.fn(),
        })

        renderWithProviders(<SettingsPage />)

        const toggle = await screen.findByRole('switch', { name: 'Approval & Reply Alerts' })
        expect(toggle).toBeDisabled()
        expect(screen.getByText('Blocked by your browser. Allow Viby, then refresh.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
    })
})
