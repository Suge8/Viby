import { AGENT_FLAVORS, type AgentAvailabilityResponse, type AgentFlavor } from '@viby/protocol'
import type { AgentAvailabilityDetector } from './availability/availabilityTypes'
import { detectClaudeAvailability } from './availability/claudeAvailability'
import { detectCodexAvailability } from './availability/codexAvailability'
import { detectCopilotAvailability } from './availability/copilotAvailability'
import { detectCursorAvailability } from './availability/cursorAvailability'
import { detectGeminiAvailability } from './availability/geminiAvailability'
import { detectOpencodeAvailability } from './availability/opencodeAvailability'
import { detectPiAvailability } from './availability/piAvailability'

type AgentAvailabilityOptions = {
    directory?: string
    forceRefresh?: boolean
    drivers?: readonly AgentFlavor[]
}

type CachedAgentAvailability = {
    expiresAt: number
    agents: AgentAvailabilityResponse['agents']
}

const STATIC_AVAILABILITY_CACHE_TTL_MS = 30_000
const DIRECTORY_AWARE_AVAILABILITY_CACHE_TTL_MS = 15_000
const DEFAULT_DETECTOR_TIMEOUT_MS = 2_500
const DETECTOR_TIMEOUT_MS: Partial<Record<AgentFlavor, number>> = {}

function createTimedOutAvailability(driver: AgentFlavor, detectedAt: number) {
    return {
        driver,
        status: 'unavailable' as const,
        resolution: 'learn_more' as const,
        code: 'unknown' as const,
        reason: `${driver} availability check timed out`,
        detectedAt,
    }
}

async function detectWithDeadline(options: {
    driver: AgentFlavor
    detector: AgentAvailabilityDetector
    detectedAt: number
    directory?: string
    forceRefresh?: boolean
}) {
    let timeout: ReturnType<typeof setTimeout> | null = null
    try {
        return await Promise.race([
            options.detector({
                detectedAt: options.detectedAt,
                directory: options.directory,
                forceRefresh: options.forceRefresh,
            }),
            new Promise<AgentAvailabilityResponse['agents'][number]>((resolve) => {
                timeout = setTimeout(
                    () => resolve(createTimedOutAvailability(options.driver, options.detectedAt)),
                    DETECTOR_TIMEOUT_MS[options.driver] ?? DEFAULT_DETECTOR_TIMEOUT_MS
                )
                timeout.unref?.()
            }),
        ])
    } finally {
        if (timeout) clearTimeout(timeout)
    }
}

const STATIC_DETECTORS = {
    claude: detectClaudeAvailability,
    codex: detectCodexAvailability,
    gemini: detectGeminiAvailability,
    opencode: detectOpencodeAvailability,
    cursor: detectCursorAvailability,
    copilot: detectCopilotAvailability,
    pi: detectPiAvailability,
} as const satisfies Partial<Record<AgentFlavor, AgentAvailabilityDetector>>

const DIRECTORY_AWARE_DETECTORS = {} as const satisfies Partial<Record<AgentFlavor, AgentAvailabilityDetector>>

const staticAvailabilityCache = new Map<string, CachedAgentAvailability>()
const directoryAwareAvailabilityCache = new Map<string, CachedAgentAvailability>()

function normalizeAvailabilityDirectory(directory?: string): string {
    const trimmedDirectory = directory?.trim()
    return trimmedDirectory && trimmedDirectory.length > 0 ? trimmedDirectory : ''
}

async function detectAvailabilityGroup(options: {
    detectedAt: number
    directory?: string
    cacheTtlMs: number
    cacheKey: string
    cache: Map<string, CachedAgentAvailability>
    detectors: Partial<Record<AgentFlavor, AgentAvailabilityDetector>>
    drivers: readonly AgentFlavor[]
    forceRefresh?: boolean
}): Promise<AgentAvailabilityResponse['agents']> {
    const detectors = Object.entries(options.detectors).filter(([driver]) =>
        options.drivers.includes(driver as AgentFlavor)
    )
    if (detectors.length === 0) return []

    const cachedAvailability = options.forceRefresh ? undefined : options.cache.get(options.cacheKey)
    if (cachedAvailability && cachedAvailability.expiresAt > Date.now()) {
        return cachedAvailability.agents
    }

    const detectedAgents = (
        await Promise.all(
            detectors.map(async ([driver, detector]) =>
                detectWithDeadline({
                    driver: driver as AgentFlavor,
                    detector,
                    detectedAt: options.detectedAt,
                    directory: options.directory,
                    forceRefresh: options.forceRefresh,
                })
            )
        )
    ).sort((left, right) => AGENT_FLAVORS.indexOf(left.driver) - AGENT_FLAVORS.indexOf(right.driver))

    options.cache.set(options.cacheKey, {
        agents: detectedAgents,
        expiresAt: Date.now() + options.cacheTtlMs,
    })

    return detectedAgents
}

export async function listAgentAvailability(
    options: AgentAvailabilityOptions = {}
): Promise<AgentAvailabilityResponse> {
    const detectedAt = Date.now()
    const directoryKey = normalizeAvailabilityDirectory(options.directory)
    const drivers = options.drivers?.length
        ? AGENT_FLAVORS.filter((driver) => options.drivers?.includes(driver))
        : AGENT_FLAVORS
    const driverKey = drivers.join(',')
    const [staticAgents, directoryAwareAgents] = await Promise.all([
        detectAvailabilityGroup({
            detectedAt,
            drivers,
            cache: staticAvailabilityCache,
            cacheKey: `static:${driverKey}`,
            cacheTtlMs: STATIC_AVAILABILITY_CACHE_TTL_MS,
            detectors: STATIC_DETECTORS,
            forceRefresh: options.forceRefresh,
        }),
        detectAvailabilityGroup({
            detectedAt,
            drivers,
            directory: options.directory,
            cache: directoryAwareAvailabilityCache,
            cacheKey: `${directoryKey}:${driverKey}`,
            cacheTtlMs: DIRECTORY_AWARE_AVAILABILITY_CACHE_TTL_MS,
            detectors: DIRECTORY_AWARE_DETECTORS,
            forceRefresh: options.forceRefresh,
        }),
    ])

    const availabilityByDriver = new Map(
        [...staticAgents, ...directoryAwareAgents].map((entry) => [entry.driver, entry])
    )

    return {
        agents: drivers.map((driver) => {
            const availability = availabilityByDriver.get(driver)
            if (!availability) {
                throw new Error(`Missing agent availability detector for ${driver}`)
            }
            return availability
        }),
    }
}
