import { AGENT_FLAVORS } from './modes'
import type { Metadata, SessionDriver, SessionDriverHandles, SessionDriverRuntimeHandle } from './schemas'

const SESSION_DRIVERS: readonly SessionDriver[] = AGENT_FLAVORS
const HANDLELESS_RESUME_DRIVERS = new Set<SessionDriver>(['pi'])
const CONTINUITY_RESUME_DRIVERS = new Set<SessionDriver>(['claude', 'codex', 'cursor', 'gemini', 'opencode', 'copilot'])

type SessionDriverMetadataSource = Partial<Pick<Metadata, 'driver' | 'runtimeHandles' | 'startedBy'>>

type SessionDriverMetadataWritableSource = SessionDriverMetadataSource

export type { SessionDriver, SessionDriverHandles, SessionDriverRuntimeHandle } from './schemas'

export function resolveSessionDriver(metadata: SessionDriverMetadataSource | null | undefined): SessionDriver | null {
    const driver = metadata?.driver
    return isSessionDriver(driver) ? driver : null
}

export function getSessionDriverRuntimeHandles(
    metadata: SessionDriverMetadataSource | null | undefined
): SessionDriverHandles | undefined {
    const runtimeHandles = metadata?.runtimeHandles
    if (!isRecord(runtimeHandles)) {
        return undefined
    }

    const normalizedHandles: SessionDriverHandles = {}
    for (const driver of SESSION_DRIVERS) {
        const handle = readRuntimeHandle(runtimeHandles[driver])
        if (handle) {
            normalizedHandles[driver] = handle
        }
    }

    return Object.keys(normalizedHandles).length > 0 ? normalizedHandles : undefined
}

export function getSessionDriverRuntimeHandle(
    metadata: SessionDriverMetadataSource | null | undefined,
    driver: SessionDriver | null = resolveSessionDriver(metadata)
): SessionDriverRuntimeHandle | undefined {
    if (!driver) {
        return undefined
    }

    const runtimeHandle = getSessionDriverRuntimeHandles(metadata)?.[driver]
    return runtimeHandle
}

export function getSessionDriverResumeToken(
    metadata: SessionDriverMetadataSource | null | undefined
): string | undefined {
    return getSessionDriverRuntimeHandle(metadata)?.sessionId
}

export function supportsHandlelessSessionResume(metadata: SessionDriverMetadataSource | null | undefined): boolean {
    const driver = resolveSessionDriver(metadata)
    return driver ? HANDLELESS_RESUME_DRIVERS.has(driver) : false
}

export function supportsSessionContinuityResume(metadata: SessionDriverMetadataSource | null | undefined): boolean {
    const driver = resolveSessionDriver(metadata)
    if (!driver || !CONTINUITY_RESUME_DRIVERS.has(driver)) {
        return false
    }

    return metadata?.startedBy === 'runner'
}

export function setSessionDriverRuntimeHandle(
    metadata: SessionDriverMetadataWritableSource | null | undefined,
    driver: SessionDriver,
    handle: SessionDriverRuntimeHandle | null | undefined
): SessionDriverMetadataWritableSource {
    const baseMetadata = metadata ? { ...metadata } : {}
    const nextRuntimeHandles = {
        ...(getSessionDriverRuntimeHandles(metadata) ?? {}),
    }

    if (handle?.sessionId) {
        nextRuntimeHandles[driver] = { sessionId: handle.sessionId }
    } else {
        delete nextRuntimeHandles[driver]
    }

    return {
        ...baseMetadata,
        driver,
        runtimeHandles: Object.keys(nextRuntimeHandles).length > 0 ? nextRuntimeHandles : undefined,
    }
}

function isSessionDriver(value: unknown): value is SessionDriver {
    return typeof value === 'string' && SESSION_DRIVERS.includes(value as SessionDriver)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRuntimeHandle(value: unknown): SessionDriverRuntimeHandle | undefined {
    if (!isRecord(value) || typeof value.sessionId !== 'string' || value.sessionId.length === 0) {
        return undefined
    }

    return { sessionId: value.sessionId }
}
