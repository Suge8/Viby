import { z } from 'zod'
import { PROTOCOL_VERSION } from './version'

export const WEB_BUILD_METADATA_FILE_NAME = 'build-meta.json'
export const WEB_BUILD_METADATA_SCHEMA_VERSION = 1
export const PRE_V2_PROTOCOL_VERSION = 1
export const MIN_SUPPORTED_PROTOCOL_VERSION = PROTOCOL_VERSION

export const WebBuildMetadataSchema = z.object({
    schemaVersion: z.literal(WEB_BUILD_METADATA_SCHEMA_VERSION),
    appVersion: z.string().min(1),
    buildId: z.string().min(1),
    protocolVersion: z.number().int().positive(),
    minSupportedProtocolVersion: z.number().int().positive(),
})
export type WebBuildMetadata = z.infer<typeof WebBuildMetadataSchema>

export function buildWebBuildMetadata(options: { appVersion: string; buildId: string }): WebBuildMetadata {
    return WebBuildMetadataSchema.parse({
        schemaVersion: WEB_BUILD_METADATA_SCHEMA_VERSION,
        appVersion: options.appVersion,
        buildId: options.buildId,
        protocolVersion: PROTOCOL_VERSION,
        minSupportedProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
    })
}

export function normalizeProtocolVersion(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function resolvePeerProtocolVersion(value: unknown): number {
    return normalizeProtocolVersion(value) ?? PRE_V2_PROTOCOL_VERSION
}

export function isProtocolVersionCompatible(
    peerProtocolVersion: number,
    options: { currentProtocolVersion?: number; minSupportedProtocolVersion?: number } = {}
): boolean {
    const currentProtocolVersion = options.currentProtocolVersion ?? PROTOCOL_VERSION
    const minSupportedProtocolVersion = options.minSupportedProtocolVersion ?? MIN_SUPPORTED_PROTOCOL_VERSION
    return peerProtocolVersion >= minSupportedProtocolVersion && peerProtocolVersion <= currentProtocolVersion
}
