import { describe, expect, it } from 'bun:test'
import {
    buildPairingManifestCookieClearHeader,
    buildPairingManifestCookieHeader,
    createPairingManifestCookieSigner,
    PAIRING_MANIFEST_COOKIE_NAME,
    readPairingManifestCookieValue,
} from './manifestCookie'

const FIXED_SECRET = new Uint8Array(32).fill(7)

describe('pairing manifest cookie', () => {
    it('round-trips a signed pairing id when the cookie is fresh so the manifest endpoint can recognise the workspace tab', () => {
        const signer = createPairingManifestCookieSigner({ secret: FIXED_SECRET })
        const expiresAtMs = 1_000_000
        const cookie = signer.sign('pairing-1', expiresAtMs)

        expect(signer.verify(cookie, 999_000)).toBe('pairing-1')
        expect(signer.verify(cookie, expiresAtMs)).toBeNull()
    })

    it('rejects tampered MAC so an attacker cannot forge a cookie pointing at someone else\u2019s pairing', () => {
        const signer = createPairingManifestCookieSigner({ secret: FIXED_SECRET })
        const cookie = signer.sign('pairing-1', 1_000_000)
        const [pairingId, expiresAt, mac] = cookie.split('.')
        const tampered = `${pairingId}.${expiresAt}.${mac.slice(0, -1)}A`

        expect(signer.verify(tampered, 999_000)).toBeNull()
    })

    it('rejects cookies whose pairing id contains characters outside the path-safe charset to defang URL injection', () => {
        const signer = createPairingManifestCookieSigner({ secret: FIXED_SECRET })
        const cookie = signer.sign('pairing/with slash', 1_000_000)

        expect(signer.verify(cookie, 999_000)).toBeNull()
    })

    it('rejects cookies signed with a different secret so a restarted broker cannot honour stale tokens', () => {
        const signerOld = createPairingManifestCookieSigner({ secret: FIXED_SECRET })
        const signerNew = createPairingManifestCookieSigner({ secret: new Uint8Array(32).fill(3) })
        const cookie = signerOld.sign('pairing-1', 1_000_000)

        expect(signerNew.verify(cookie, 999_000)).toBeNull()
    })

    it('reads only the named pairing manifest cookie out of a typical multi-value Cookie header', () => {
        const header = `analytics=abc; ${PAIRING_MANIFEST_COOKIE_NAME}=pairing-1.1000.MAC ; theme=dark`
        expect(readPairingManifestCookieValue(header)).toBe('pairing-1.1000.MAC')
        expect(readPairingManifestCookieValue(null)).toBeNull()
        expect(readPairingManifestCookieValue('other=value')).toBeNull()
    })

    it('builds a hardened Set-Cookie header that survives strict iOS Safari defaults so the manifest fetch sees the value', () => {
        const header = buildPairingManifestCookieHeader('pairing-1.1000.MAC', 600)
        expect(header).toContain('HttpOnly')
        expect(header).toContain('Secure')
        expect(header).toContain('SameSite=Lax')
        expect(header).toContain('Path=/')
        expect(header).toContain('Max-Age=600')
        expect(header).toContain(`${PAIRING_MANIFEST_COOKIE_NAME}=pairing-1.1000.MAC`)
    })

    it('emits an immediate-clear cookie header so the broker can revoke a manifest binding on pairing teardown', () => {
        const header = buildPairingManifestCookieClearHeader()
        expect(header).toContain('Max-Age=0')
        expect(header).toContain(`${PAIRING_MANIFEST_COOKIE_NAME}=;`)
    })
})
