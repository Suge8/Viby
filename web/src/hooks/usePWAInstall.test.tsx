import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePWAInstall } from './usePWAInstall'

const ANDROID_CHROME_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Mobile Safari/537.36'

type MockBeforeInstallPromptEvent = Event & {
    prompt: ReturnType<typeof vi.fn<() => Promise<void>>>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function InstallProbe() {
    const { installPlatform, isStandalone, promptInstall, dismissInstall } = usePWAInstall()

    return (
        <div>
            <div data-testid="platform">{installPlatform ?? 'none'}</div>
            <div data-testid="standalone">{String(isStandalone)}</div>
            <button onClick={() => void promptInstall()}>prompt</button>
            <button onClick={dismissInstall}>dismiss</button>
        </div>
    )
}

function installAndroidChromeUserAgent(): void {
    Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value: ANDROID_CHROME_UA,
    })
}

function installMatchMediaMock(standalone: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches: query === '(display-mode: standalone)' ? standalone : false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    })
}

function createBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): MockBeforeInstallPromptEvent {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as MockBeforeInstallPromptEvent
    event.prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome })
    return event
}

describe('usePWAInstall', () => {
    const originalUserAgent = window.navigator.userAgent
    const originalPlatform = window.navigator.platform
    const originalMaxTouchPoints = window.navigator.maxTouchPoints
    const originalStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
        cleanup()
        window.localStorage.clear()
        installMatchMediaMock(false)
        Object.defineProperty(window.navigator, 'standalone', {
            configurable: true,
            value: false,
        })
        Object.defineProperty(window.navigator, 'platform', {
            configurable: true,
            value: 'MacIntel',
        })
        Object.defineProperty(window.navigator, 'maxTouchPoints', {
            configurable: true,
            value: 0,
        })
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        })
    })

    afterEach(() => {
        cleanup()
        window.localStorage.clear()
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: originalUserAgent,
        })
        Object.defineProperty(window.navigator, 'standalone', {
            configurable: true,
            value: originalStandalone,
        })
        Object.defineProperty(window.navigator, 'platform', {
            configurable: true,
            value: originalPlatform,
        })
        Object.defineProperty(window.navigator, 'maxTouchPoints', {
            configurable: true,
            value: originalMaxTouchPoints,
        })
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: originalMatchMedia,
        })
    })

    it('surfaces native install availability on Android after beforeinstallprompt and clears after acceptance', async () => {
        installAndroidChromeUserAgent()

        render(<InstallProbe />)

        const promptEvent = createBeforeInstallPromptEvent('accepted')
        window.dispatchEvent(promptEvent)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('native')
        })

        fireEvent.click(screen.getByRole('button', { name: 'prompt' }))

        await waitFor(() => {
            expect(promptEvent.prompt).toHaveBeenCalledTimes(1)
            expect(screen.getByTestId('platform')).toHaveTextContent('none')
        })
    })

    it('surfaces native install availability on desktop after beforeinstallprompt', async () => {
        render(<InstallProbe />)

        const promptEvent = createBeforeInstallPromptEvent('accepted')
        window.dispatchEvent(promptEvent)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('native')
        })
        expect(promptEvent.defaultPrevented).toBe(true)
    })

    it('hides the install surface within the current session after dismiss but re-shows it on a fresh tab', async () => {
        installAndroidChromeUserAgent()

        render(<InstallProbe />)

        window.dispatchEvent(createBeforeInstallPromptEvent('dismissed'))

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('native')
        })

        fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))

        // Dismiss is session-scoped so a fresh tab/scan always re-offers the
        // banner; the previous three-day localStorage TTL surprised users who
        // expected the prompt to come back on every new pairing entry.
        expect(window.sessionStorage.getItem('viby-pwa-install-dismissed')).toBe('1')
        expect(window.localStorage.getItem('pwa_install_dismissed')).toBeNull()
        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('none')
        })
    })

    it('treats macOS Safari browser mode as Add to Dock guidance', async () => {
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        })

        render(<InstallProbe />)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('desktop-safari')
        })
    })

    it('treats iOS Safari browser mode as manual install guidance', async () => {
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        })

        render(<InstallProbe />)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('ios')
            expect(screen.getByTestId('standalone')).toHaveTextContent('false')
        })
    })

    it('treats iPadOS desktop browser mode as manual install guidance', async () => {
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        })
        Object.defineProperty(window.navigator, 'maxTouchPoints', {
            configurable: true,
            value: 5,
        })

        render(<InstallProbe />)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('ios')
        })
    })

    it('treats iOS Chrome browser mode as manual install guidance', async () => {
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/144.0.7559.95 Mobile/15E148 Safari/604.1',
        })

        render(<InstallProbe />)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('ios')
        })
    })
})
