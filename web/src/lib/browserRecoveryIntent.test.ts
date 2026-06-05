import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetBrowserRecoveryIntentForTests, subscribeBrowserRecoveryIntent } from '@/lib/browserRecoveryIntent'

describe('browserRecoveryIntent', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        resetBrowserRecoveryIntentForTests()
    })

    it('emits one foreground intent through the shared lifecycle owner', () => {
        const kinds: string[] = []
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        subscribeBrowserRecoveryIntent((intent) => {
            kinds.push(`${intent.kind}:${intent.reason ?? ''}`)
        })

        document.dispatchEvent(new Event('visibilitychange'))

        expect(kinds).toEqual(['foreground:visible'])
    })

    it('emits background and pagehide intents without raw DOM listeners in consumers', () => {
        const kinds: string[] = []
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        subscribeBrowserRecoveryIntent((intent) => {
            kinds.push(intent.kind)
        })

        document.dispatchEvent(new Event('visibilitychange'))
        window.dispatchEvent(new Event('pagehide'))

        expect(kinds).toEqual(['backgrounded', 'pagehide'])
    })

    it('emits online snapshot changes and foreground recovery when visible connectivity returns', () => {
        const intents: string[] = []
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        subscribeBrowserRecoveryIntent((intent) => {
            intents.push(`${intent.kind}:${intent.online}:${intent.reason ?? ''}`)
        })

        window.dispatchEvent(new Event('online'))

        expect(intents).toEqual(['online-changed:true:', 'foreground:true:network'])
    })

    it('does not emit foreground recovery for hidden network changes', () => {
        const intents: string[] = []
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
        subscribeBrowserRecoveryIntent((intent) => {
            intents.push(`${intent.kind}:${intent.online}:${intent.reason ?? ''}`)
        })

        window.dispatchEvent(new Event('online'))

        expect(intents).toEqual(['online-changed:true:'])
    })
})
