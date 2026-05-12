import { describe, expect, it } from 'vitest'
import { applyHubFlagsToEnv, HubFlagError, parseHubFlags } from './hubFlags'

describe('parseHubFlags', () => {
    it('returns empty parsed shape when no flags are provided', () => {
        expect(parseHubFlags([])).toEqual({})
    })

    it('parses --host and --port with separated values', () => {
        expect(parseHubFlags(['--host', '0.0.0.0', '--port', '38080'])).toEqual({
            host: '0.0.0.0',
            port: '38080',
        })
    })

    it('parses --host= and --port= with inline values', () => {
        expect(parseHubFlags(['--host=192.168.1.10', '--port=38080'])).toEqual({
            host: '192.168.1.10',
            port: '38080',
        })
    })

    it('maps --local to loopback host', () => {
        expect(parseHubFlags(['--local'])).toEqual({ host: '127.0.0.1' })
    })

    it('maps --lan to wildcard host', () => {
        expect(parseHubFlags(['--lan'])).toEqual({ host: '0.0.0.0' })
    })

    it('toggles public access via --public and --no-public', () => {
        expect(parseHubFlags(['--public'])).toEqual({ publicAccessEnabled: true })
        expect(parseHubFlags(['--no-public'])).toEqual({ publicAccessEnabled: false })
    })

    it('keeps repeated equivalent flags idempotent', () => {
        expect(parseHubFlags(['--local', '--host=127.0.0.1', '--public', '--public'])).toEqual({
            host: '127.0.0.1',
            publicAccessEnabled: true,
        })
    })

    it('rejects conflicting host flags', () => {
        expect(() => parseHubFlags(['--local', '--lan'])).toThrow(HubFlagError)
    })

    it('rejects conflicting public flags', () => {
        expect(() => parseHubFlags(['--public', '--no-public'])).toThrow(HubFlagError)
    })

    it('rejects missing values', () => {
        expect(() => parseHubFlags(['--host'])).toThrow(HubFlagError)
        expect(() => parseHubFlags(['--port', '--public'])).toThrow(HubFlagError)
    })

    it('rejects unknown flags', () => {
        expect(() => parseHubFlags(['--bogus'])).toThrow(HubFlagError)
    })
})

describe('applyHubFlagsToEnv', () => {
    it('writes only the provided fields, leaving others untouched', () => {
        const env: NodeJS.ProcessEnv = { EXISTING: 'value' }
        applyHubFlagsToEnv({ host: '0.0.0.0', publicAccessEnabled: false }, env)
        expect(env.VIBY_LISTEN_HOST).toBe('0.0.0.0')
        expect(env.VIBY_PUBLIC_ACCESS_ENABLED).toBe('false')
        expect(env.VIBY_LISTEN_PORT).toBeUndefined()
        expect(env.EXISTING).toBe('value')
    })

    it('writes port and public access truthy values', () => {
        const env: NodeJS.ProcessEnv = {}
        applyHubFlagsToEnv({ port: '38080', publicAccessEnabled: true }, env)
        expect(env.VIBY_LISTEN_PORT).toBe('38080')
        expect(env.VIBY_PUBLIC_ACCESS_ENABLED).toBe('true')
    })
})
