import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { usePWAInstall } from './usePWAInstall'

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
            dispatchEvent: vi.fn()
        }))
    })
}

function createBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted'): MockBeforeInstallPromptEvent {
    const event = new Event('beforeinstallprompt') as MockBeforeInstallPromptEvent
    event.prompt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    event.userChoice = Promise.resolve({ outcome })
    return event
}

describe('usePWAInstall', () => {
    const originalUserAgent = window.navigator.userAgent
    const originalStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
    const originalMatchMedia = window.matchMedia

    beforeEach(() => {
        cleanup()
        window.localStorage.clear()
        installMatchMediaMock(false)
        Object.defineProperty(window.navigator, 'standalone', {
            configurable: true,
            value: false
        })
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36'
        })
    })

    afterEach(() => {
        cleanup()
        window.localStorage.clear()
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: originalUserAgent
        })
        Object.defineProperty(window.navigator, 'standalone', {
            configurable: true,
            value: originalStandalone
        })
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: originalMatchMedia
        })
    })

    it('surfaces native install availability after beforeinstallprompt and clears after acceptance', async () => {
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

    it('persists dismiss state and hides the install surface', async () => {
        render(<InstallProbe />)

        window.dispatchEvent(createBeforeInstallPromptEvent('dismissed'))

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('native')
        })

        fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))

        expect(window.localStorage.getItem('pwa_install_dismissed')).toBe('true')
        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('none')
        })
    })

    it('treats iOS Safari browser mode as manual install guidance', async () => {
        Object.defineProperty(window.navigator, 'userAgent', {
            configurable: true,
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        })

        render(<InstallProbe />)

        await waitFor(() => {
            expect(screen.getByTestId('platform')).toHaveTextContent('ios')
            expect(screen.getByTestId('standalone')).toHaveTextContent('false')
        })
    })
})
