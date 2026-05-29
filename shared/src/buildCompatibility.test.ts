import { describe, expect, it } from 'bun:test'
import {
    buildWebBuildMetadata,
    isProtocolVersionCompatible,
    normalizeProtocolVersion,
    PRE_V2_PROTOCOL_VERSION,
    PROTOCOL_VERSION,
    resolvePeerProtocolVersion,
    WEB_BUILD_METADATA_SCHEMA_VERSION,
    WebBuildMetadataSchema,
} from './index'

describe('buildCompatibility', () => {
    it('builds deterministic web metadata from the protocol owner', () => {
        expect(buildWebBuildMetadata({ appVersion: '0.2.0', buildId: '0.2.0+abc' })).toEqual({
            schemaVersion: WEB_BUILD_METADATA_SCHEMA_VERSION,
            appVersion: '0.2.0',
            buildId: '0.2.0+abc',
            protocolVersion: PROTOCOL_VERSION,
            minSupportedProtocolVersion: PROTOCOL_VERSION,
        })
    })

    it('rejects malformed metadata', () => {
        expect(() => WebBuildMetadataSchema.parse({ schemaVersion: 1, appVersion: '', buildId: 'x' })).toThrow()
    })

    it('treats missing peer protocol as the legacy protocol window', () => {
        expect(normalizeProtocolVersion('1')).toBeNull()
        expect(resolvePeerProtocolVersion(undefined)).toBe(PRE_V2_PROTOCOL_VERSION)
    })

    it('accepts only the declared supported protocol window', () => {
        expect(isProtocolVersionCompatible(1, { currentProtocolVersion: 2, minSupportedProtocolVersion: 1 })).toBe(true)
        expect(isProtocolVersionCompatible(3, { currentProtocolVersion: 2, minSupportedProtocolVersion: 1 })).toBe(
            false
        )
        expect(isProtocolVersionCompatible(1, { currentProtocolVersion: 2, minSupportedProtocolVersion: 2 })).toBe(
            false
        )
    })

    it('rejects legacy peers after the lazy remote message RPC became mandatory', () => {
        expect(PROTOCOL_VERSION).toBeGreaterThan(PRE_V2_PROTOCOL_VERSION)
        expect(isProtocolVersionCompatible(PRE_V2_PROTOCOL_VERSION)).toBe(false)
        expect(isProtocolVersionCompatible(PROTOCOL_VERSION)).toBe(true)
    })
})
