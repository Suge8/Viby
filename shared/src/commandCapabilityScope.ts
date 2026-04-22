import type { Metadata } from './schemas'
import { resolveSessionDriver } from './sessionDriver'

export function resolveCommandCapabilityScopeKey(metadata: Metadata | null | undefined): string {
    const driver = resolveSessionDriver(metadata) ?? 'unknown'
    const path = typeof metadata?.path === 'string' && metadata.path.length > 0 ? metadata.path : ''
    return `${driver}:${path}`
}
