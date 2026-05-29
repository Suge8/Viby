import { beforeEach, describe, expect, it } from 'vitest'
import {
    formatRemotePairingDiagnostics,
    readRemotePairingDiagnostics,
    recordRemotePairingDiagnostic,
    resetRemotePairingDiagnosticsForTests,
} from './remotePairingDiagnostics'

describe('remotePairingDiagnostics', () => {
    beforeEach(() => {
        resetRemotePairingDiagnosticsForTests()
        window.history.replaceState(null, '', '/sessions')
        window.sessionStorage.clear()
    })

    it('records only when debug mode is enabled', () => {
        recordRemotePairingDiagnostic('transport', { state: 'ready' })
        expect(readRemotePairingDiagnostics()).toHaveLength(0)

        window.history.replaceState(null, '', '/sessions?debug=pairing')
        recordRemotePairingDiagnostic('transport', { state: 'ready' })

        expect(readRemotePairingDiagnostics()).toHaveLength(1)
        expect(window.sessionStorage.getItem('viby:remote-pairing-diagnostics')).toContain('transport')
    })

    it('formats stored diagnostics after in-memory reset', () => {
        window.history.replaceState(null, '', '/sessions?debug=pairing')
        recordRemotePairingDiagnostic('rpc-failure', { route: 'relay' })
        resetRemotePairingDiagnosticsForTests()

        expect(formatRemotePairingDiagnostics()).toContain('rpc-failure')
    })

    it('drops malformed stored diagnostics instead of trusting sessionStorage', () => {
        window.sessionStorage.setItem('viby:remote-pairing-diagnostics', JSON.stringify([{ at: 'bad' }]))

        expect(formatRemotePairingDiagnostics()).toBe('[]')
        expect(window.sessionStorage.getItem('viby:remote-pairing-diagnostics')).toBeNull()
    })
})
