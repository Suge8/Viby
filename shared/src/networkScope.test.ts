import { describe, expect, it } from 'bun:test'
import {
    isLocalNetworkHostname,
    isLocalNetworkHostnameOrMissing,
    isLocalNetworkUrl,
    isReachableLocalNetworkUrl,
} from './networkScope'

describe('networkScope', () => {
    it('classifies local hostnames and private network addresses', () => {
        expect(isLocalNetworkHostname('localhost')).toBe(true)
        expect(isLocalNetworkHostname('127.0.0.1')).toBe(true)
        expect(isLocalNetworkHostname('192.168.1.8')).toBe(true)
        expect(isLocalNetworkHostname('100.88.1.5')).toBe(true)
        expect(isLocalNetworkHostname('[::1]')).toBe(true)
        expect(isLocalNetworkHostname('hub.example.com')).toBe(false)
    })

    it('treats missing origin-like hostnames as local for same-origin requests only', () => {
        expect(isLocalNetworkHostnameOrMissing(null)).toBe(true)
        expect(isLocalNetworkHostnameOrMissing('hub.example.com')).toBe(false)
    })

    it('classifies URLs by host without trusting malformed input', () => {
        expect(isLocalNetworkUrl('http://192.168.1.8:37173')).toBe(true)
        expect(isLocalNetworkUrl('https://hub.example.com')).toBe(false)
        expect(isLocalNetworkUrl('not a url')).toBe(false)
    })

    it('distinguishes device-reachable local URLs from loopback bind URLs', () => {
        expect(isReachableLocalNetworkUrl('http://192.168.1.8:37173')).toBe(true)
        expect(isReachableLocalNetworkUrl('http://viby.local:37173')).toBe(true)
        expect(isReachableLocalNetworkUrl('http://127.0.0.1:37173')).toBe(false)
        expect(isReachableLocalNetworkUrl('http://0.0.0.0:37173')).toBe(false)
        expect(isReachableLocalNetworkUrl('https://hub.example.com')).toBe(false)
    })
})
