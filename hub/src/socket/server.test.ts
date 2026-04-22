import { describe, expect, it } from 'bun:test'
import {
    isAllowedSocketOrigin,
    SOCKET_CONNECTION_RECOVERY_SKIP_MIDDLEWARES,
    SOCKET_CONNECTION_RECOVERY_WINDOW_MS,
    SOCKET_PING_INTERVAL_MS,
    SOCKET_PING_TIMEOUT_MS,
} from './server'

const LOOPBACK_ORIGIN = 'http://localhost:37173'
const LOOPBACK_ALIAS_ORIGIN = 'http://127.0.0.1:37173'
const LAN_ORIGIN = 'http://100.88.12.5:37173'
const LAN_REQUEST_HOST = '100.88.12.5:37173'
const PUBLIC_PROXY_ORIGIN = 'https://hub.example.com'
const PUBLIC_PROXY_HOST = 'hub.example.com'
const UNRELATED_REMOTE_ORIGIN = 'https://app.example.com'

describe('isAllowedSocketOrigin', () => {
    it('keeps web connection recovery available for ten minutes', () => {
        expect(SOCKET_CONNECTION_RECOVERY_WINDOW_MS).toBe(10 * 60_000)
        expect(SOCKET_CONNECTION_RECOVERY_SKIP_MIDDLEWARES).toBe(true)
        expect(SOCKET_PING_INTERVAL_MS).toBe(25_000)
        expect(SOCKET_PING_TIMEOUT_MS).toBe(20_000)
    })

    it('allows exact configured origins', () => {
        expect(
            isAllowedSocketOrigin({
                origin: LOOPBACK_ORIGIN,
                corsOrigins: [LOOPBACK_ORIGIN],
            })
        ).toBe(true)
    })

    it('allows loopback aliases when local hub origins are configured', () => {
        expect(
            isAllowedSocketOrigin({
                origin: LOOPBACK_ALIAS_ORIGIN,
                corsOrigins: [LOOPBACK_ORIGIN],
            })
        ).toBe(true)
    })

    it('allows same-origin LAN access even when configured origins stay on loopback', () => {
        expect(
            isAllowedSocketOrigin({
                origin: LAN_ORIGIN,
                corsOrigins: [LOOPBACK_ALIAS_ORIGIN],
                requestHost: LAN_REQUEST_HOST,
            })
        ).toBe(true)
    })

    it('accepts same-origin requests when proxy forwarding keeps the public host first', () => {
        expect(
            isAllowedSocketOrigin({
                origin: PUBLIC_PROXY_ORIGIN,
                corsOrigins: [LOOPBACK_ALIAS_ORIGIN],
                requestHost: PUBLIC_PROXY_HOST,
            })
        ).toBe(true)
    })

    it('rejects unrelated remote origins', () => {
        expect(
            isAllowedSocketOrigin({
                origin: UNRELATED_REMOTE_ORIGIN,
                corsOrigins: [LOOPBACK_ORIGIN],
                requestHost: LAN_REQUEST_HOST,
            })
        ).toBe(false)
    })
})
