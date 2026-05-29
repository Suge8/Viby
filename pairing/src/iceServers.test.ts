import { describe, expect, it } from 'bun:test'
import { buildIceServers, parseCsvUrls } from './iceServers'

describe('iceServers', () => {
    it('builds STUN-only ICE servers for direct probing', () => {
        expect(buildIceServers({ stunUrls: ['stun:stun.example.com:3478'] })).toEqual([
            { urls: 'stun:stun.example.com:3478' },
        ])
    })

    it('normalizes comma-separated ICE urls', () => {
        expect(parseCsvUrls(' stun:a.example.com:3478,stun:b.example.com:3478 ,,')).toEqual([
            'stun:a.example.com:3478',
            'stun:b.example.com:3478',
        ])
    })
})
