import { AGENT_FLAVORS } from './modes'
import type {
    Metadata,
    SessionDriver,
    SessionDriverHandles,
    SessionDriverRuntimeHandle
} from './schemas'

const SESSION_DRIVERS: readonly SessionDriver[] = AGENT_FLAVORS

const LEGACY_RESUME_TOKEN_FIELDS = {
    claude: 'claudeSessionId',
    codex: 'codexSessionId',
    gemini: 'geminiSessionId',
    opencode: 'opencodeSessionId',
    cursor: 'cursorSessionId',
    pi: 'piSessionId'
} satisfies Record<SessionDriver, keyof SessionDriverMetadataSource>

type SessionDriverMetadataSource = Partial<Pick<
    Metadata,
    | 'driver'
    | 'runtimeHandles'
    | 'claudeSessionId'
    | 'codexSessionId'
    | 'geminiSessionId'
    | 'opencodeSessionId'
    | 'cursorSessionId'
    | 'piSessionId'
>>

type SessionDriverMetadataWritableSource = SessionDriverMetadataSource

export type { SessionDriver, SessionDriverHandles, SessionDriverRuntimeHandle } from './schemas'

export function resolveSessionDriver(
    metadata: SessionDriverMetadataSource | null | undefined
): SessionDriver | null {
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
    if (runtimeHandle) {
        return runtimeHandle
    }

    const legacySessionId = readLegacySessionId(metadata, driver)
    return legacySessionId ? { sessionId: legacySessionId } : undefined
}

export function getSessionDriverResumeToken(
    metadata: SessionDriverMetadataSource | null | undefined
): string | undefined {
    return getSessionDriverRuntimeHandle(metadata)?.sessionId
}

export function setSessionDriverRuntimeHandle(
    metadata: SessionDriverMetadataWritableSource | null | undefined,
    driver: SessionDriver,
    handle: SessionDriverRuntimeHandle | null | undefined
): SessionDriverMetadataWritableSource {
    const baseMetadata = metadata ? { ...metadata } : {}
    const nextRuntimeHandles = {
        ...(getSessionDriverRuntimeHandles(metadata) ?? {})
    }

    if (handle?.sessionId) {
        nextRuntimeHandles[driver] = { sessionId: handle.sessionId }
    } else {
        delete nextRuntimeHandles[driver]
    }

    return {
        ...baseMetadata,
        driver,
        runtimeHandles: Object.keys(nextRuntimeHandles).length > 0 ? nextRuntimeHandles : undefined
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

function readLegacySessionId(
    metadata: SessionDriverMetadataSource | null | undefined,
    driver: SessionDriver
): string | undefined {
    const sessionId = metadata?.[LEGACY_RESUME_TOKEN_FIELDS[driver]]
    return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}
