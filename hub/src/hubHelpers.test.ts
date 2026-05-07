import { describe, expect, it } from 'bun:test'
import {
    buildLocalOriginAliases,
    resolveDefaultPublicApiUrl,
    resolveLocalApiUrl,
    resolveWildcardPublicHost,
} from './hubHelpers'

describe('hubHelpers URL resolution', () => {
    it('keeps wildcard binds local for internal API calls', () => {
        expect(resolveLocalApiUrl('0.0.0.0', 37173)).toBe('http://127.0.0.1:37173')
    })

    it('uses a concrete LAN address as the wildcard public host', () => {
        expect(
            resolveWildcardPublicHost({
                lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true, cidr: null, mac: '', netmask: '' }],
                en0: [{ address: '192.168.1.24', family: 'IPv4', internal: false, cidr: null, mac: '', netmask: '' }],
            })
        ).toBe('192.168.1.24')
    })

    it('keeps desktop loopback aliases when LAN public URL is used', () => {
        expect(buildLocalOriginAliases('0.0.0.0', 37173)).toContain('tauri://localhost')
        expect(resolveDefaultPublicApiUrl('127.0.0.1', 37173)).toBe('http://127.0.0.1:37173')
    })
})
