import { describe, expect, it } from 'bun:test'
import { evaluatePairingPwaContract } from './pairingPwaContract'

const validFiles = {
    'package.json':
        '"harness:pairing-pwa": "bun run scripts/harness/pairingPwaContract.ts", "harness:check": "bun run harness:pairing-pwa && bun run harness:quality:gate"',
    'shared/src/pairing/pairingWorkspaceRoute.ts': [
        "export const PAIRING_PWA_MANIFEST_PAIRING_PARAM = 'pairing'",
        "export const PAIRING_PWA_HANDOFF_PARAM = 'handoff'",
    ].join('\n'),
    'pairing/src/http.ts': [
        '[PAIRING_PWA_MANIFEST_PAIRING_PARAM]: pairingId',
        'suppressManifest: isPwaHandoffLaunch(c.req.url)',
    ].join('\n'),
    'pairing/src/httpPwaManifest.ts': [
        "const DEFAULT_START_URL = '/sessions?remote=1'",
        'queryUrl.searchParams.get(PAIRING_PWA_MANIFEST_PAIRING_PARAM)',
        'readPairingManifestCookieValue',
        'new URLSearchParams({ [PAIRING_PWA_HANDOFF_PARAM]: handoffTicket })',
        "options.personalized ? 'no-store'",
    ].join('\n'),
    'pairing/src/httpPwaManifest.test.ts': 'honours the path-based pairing query',
    'pairing/src/http.test.ts': 'does not expose a manifest link during PWA handoff launch',
    'web/src/hooks/usePWAInstall.ts': 'install prompt only',
    'web/src/sw.ts': 'precache only',
    'web/src/components/AppController.tsx': 'RemotePwaBootstrap',
    'web/src/remote/RemotePwaBootstrap.tsx': [
        'recoverRemotePairingFromCookie()',
        "history.replace(withPairingWorkspaceIntent('/sessions'))",
    ].join('\n'),
    'web/src/remote/RemotePairingControllerView.tsx':
        "props.pathname.startsWith('/sessions') ? props.pathname : '/sessions'",
    'web/src/remote/RemotePairingController.test.tsx':
        'renders the retained workspace during `/p` handoff while the URL is normalized',
    'web/src/remote/remotePairingPwaHandoffWarmup.ts': [
        'searchParams.set(PAIRING_PWA_MANIFEST_PAIRING_PARAM, pairingId)',
        'createRemotePwaHandoff(props.pairingId)',
    ].join('\n'),
    'web/src/remote/remotePairingPwaHandoffWarmup.test.tsx': 'binds the manifest URL to the current pairing',
}

function snapshot(overrides?: Partial<typeof validFiles>, existingPaths = Object.keys(validFiles)) {
    return {
        existingPaths,
        files: { ...validFiles, ...overrides },
    }
}

describe('pairing PWA contract harness', () => {
    it('passes when PWA handoff has one owner across web, broker, and tests', () => {
        expect(evaluatePairingPwaContract(snapshot())).toEqual([])
    })

    it('fails when manifest resolution falls back to cookies before URL pairing id', () => {
        const violations = evaluatePairingPwaContract(
            snapshot({
                'pairing/src/httpPwaManifest.ts': [
                    "const DEFAULT_START_URL = '/sessions?remote=1'",
                    'readPairingManifestCookieValue',
                    'queryUrl.searchParams.get(PAIRING_PWA_MANIFEST_PAIRING_PARAM)',
                    'new URLSearchParams({ [PAIRING_PWA_HANDOFF_PARAM]: handoffTicket })',
                    "options.personalized ? 'no-store'",
                ].join('\n'),
            })
        )

        expect(violations.some((violation) => violation.rule === 'manifest-resolution-order')).toBe(true)
    })

    it('fails when Service Worker manifest personalization returns as a second owner', () => {
        const violations = evaluatePairingPwaContract(snapshot({ 'web/src/sw.ts': 'manifest.webmanifest' }))

        expect(violations.some((violation) => violation.rule === 'forbidden-fragment')).toBe(true)
    })
})
