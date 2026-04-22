import { AGENT_FLAVORS, type AgentAvailabilityResponse } from '@viby/protocol'
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
}

type CachedAgentAvailability = {
    expiresAt: number
    agents: AgentAvailabilityResponse['agents']
}

const STATIC_AVAILABILITY_CACHE_TTL_MS = 30_000
const DIRECTORY_AWARE_AVAILABILITY_CACHE_TTL_MS = 15_000

const STATIC_DETECTORS = {
    claude: detectClaudeAvailability,
    codex: detectCodexAvailability,
    gemini: detectGeminiAvailability,
    opencode: detectOpencodeAvailability,
    cursor: detectCursorAvailability,
    copilot: detectCopilotAvailability,
} as const satisfies Partial<Record<(typeof AGENT_FLAVORS)[number], AgentAvailabilityDetector>>

const DIRECTORY_AWARE_DETECTORS = {
    pi: detectPiAvailability,
} as const satisfies Partial<Record<(typeof AGENT_FLAVORS)[number], AgentAvailabilityDetector>>

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
    detectors: Partial<Record<(typeof AGENT_FLAVORS)[number], AgentAvailabilityDetector>>
    forceRefresh?: boolean
}): Promise<AgentAvailabilityResponse['agents']> {
    const cachedAvailability = options.forceRefresh ? undefined : options.cache.get(options.cacheKey)
    if (cachedAvailability && cachedAvailability.expiresAt > Date.now()) {
        return cachedAvailability.agents
    }

    const detectedAgents = (
        await Promise.all(
            Object.entries(options.detectors).map(async ([driver, detector]) => {
                return await detector({
                    detectedAt: options.detectedAt,
                    directory: options.directory,
                    forceRefresh: options.forceRefresh,
                })
            })
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
    const [staticAgents, directoryAwareAgents] = await Promise.all([
        detectAvailabilityGroup({
            detectedAt,
            cache: staticAvailabilityCache,
            cacheKey: 'static',
            cacheTtlMs: STATIC_AVAILABILITY_CACHE_TTL_MS,
            detectors: STATIC_DETECTORS,
            forceRefresh: options.forceRefresh,
        }),
        detectAvailabilityGroup({
            detectedAt,
            directory: options.directory,
            cache: directoryAwareAvailabilityCache,
            cacheKey: directoryKey,
            cacheTtlMs: DIRECTORY_AWARE_AVAILABILITY_CACHE_TTL_MS,
            detectors: DIRECTORY_AWARE_DETECTORS,
            forceRefresh: options.forceRefresh,
        }),
    ])

    const availabilityByDriver = new Map(
        [...staticAgents, ...directoryAwareAgents].map((entry) => [entry.driver, entry])
    )

    return {
        agents: AGENT_FLAVORS.map((driver) => {
            const availability = availabilityByDriver.get(driver)
            if (!availability) {
                throw new Error(`Missing agent availability detector for ${driver}`)
            }
            return availability
        }),
    }
}
