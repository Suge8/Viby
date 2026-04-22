import { z } from 'zod'
import type { AgentFlavor } from './modes'
import { SessionDriverSchema } from './schemas'

export const AGENT_AVAILABILITY_STATUS = [
    'ready',
    'not_installed',
    'setup_required',
    'unsupported_platform',
    'unavailable',
] as const

export const AGENT_AVAILABILITY_RESOLUTION = ['none', 'install', 'configure', 'learn_more'] as const
export const AGENT_AVAILABILITY_CODES = [
    'ready',
    'command_missing',
    'auth_missing',
    'config_missing',
    'platform_unsupported',
    'provider_unavailable',
    'unknown',
] as const

export const AgentAvailabilityStatusSchema = z.enum(AGENT_AVAILABILITY_STATUS)
export const AgentAvailabilityResolutionSchema = z.enum(AGENT_AVAILABILITY_RESOLUTION)
export const AgentAvailabilityCodeSchema = z.enum(AGENT_AVAILABILITY_CODES)

export const AgentAvailabilitySchema = z.object({
    driver: SessionDriverSchema,
    status: AgentAvailabilityStatusSchema,
    resolution: AgentAvailabilityResolutionSchema,
    code: AgentAvailabilityCodeSchema,
    reason: z.string().optional(),
    detectedAt: z.number().int().nonnegative(),
})

export type AgentAvailabilityStatus = z.infer<typeof AgentAvailabilityStatusSchema>
export type AgentAvailabilityResolution = z.infer<typeof AgentAvailabilityResolutionSchema>
export type AgentAvailabilityCode = z.infer<typeof AgentAvailabilityCodeSchema>
export type AgentAvailability = z.infer<typeof AgentAvailabilitySchema>

export const AgentAvailabilityResponseSchema = z.object({
    agents: z.array(AgentAvailabilitySchema),
})

const QueryBooleanSchema = z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')

export const ListAgentAvailabilityRequestSchema = z.object({
    directory: z.string().trim().min(1).optional(),
    forceRefresh: QueryBooleanSchema.optional(),
})

export type AgentAvailabilityResponse = z.infer<typeof AgentAvailabilityResponseSchema>
export type ListAgentAvailabilityRequest = z.infer<typeof ListAgentAvailabilityRequestSchema>

type AgentSupportLinkCatalogEntry = {
    installUrl?: string
    configureUrl?: string
    learnMoreUrl?: string
}

export const AGENT_SUPPORT_LINKS = {
    claude: {
        installUrl: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
        configureUrl: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
        learnMoreUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    },
    codex: {
        installUrl: 'https://developers.openai.com/codex/cli',
        configureUrl: 'https://developers.openai.com/codex/cli',
        learnMoreUrl: 'https://developers.openai.com/codex/cli',
    },
    gemini: {
        installUrl: 'https://github.com/google-gemini/gemini-cli',
        configureUrl: 'https://github.com/google-gemini/gemini-cli',
        learnMoreUrl: 'https://github.com/google-gemini/gemini-cli',
    },
    opencode: {
        installUrl: 'https://dev.opencode.ai/docs/cli',
        configureUrl: 'https://dev.opencode.ai/docs/cli',
        learnMoreUrl: 'https://dev.opencode.ai/docs/cli',
    },
    cursor: {
        installUrl: 'https://cursor.com/downloads',
        configureUrl: 'https://docs.cursor.com/en/cli/overview',
        learnMoreUrl: 'https://docs.cursor.com/en/cli/overview',
    },
    pi: {
        configureUrl: 'https://www.npmjs.com/package/@mariozechner/pi-coding-agent',
        learnMoreUrl: 'https://www.npmjs.com/package/@mariozechner/pi-coding-agent',
    },
    copilot: {
        installUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli',
        configureUrl:
            'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-to-copilot-cli',
        learnMoreUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli',
    },
} as const satisfies Record<AgentFlavor, AgentSupportLinkCatalogEntry>

function getInstallUrl(links: AgentSupportLinkCatalogEntry): string | undefined {
    return links.installUrl
}

function getConfigureUrl(links: AgentSupportLinkCatalogEntry): string | undefined {
    return links.configureUrl
}

function getLearnMoreUrl(links: AgentSupportLinkCatalogEntry): string | undefined {
    return links.learnMoreUrl
}

export function getAgentSupportLink(
    driver: AgentFlavor,
    resolution: AgentAvailabilityResolution | null | undefined
): string | null {
    const links = AGENT_SUPPORT_LINKS[driver]
    if (!links) {
        return null
    }

    switch (resolution) {
        case 'install':
            return getInstallUrl(links) ?? getLearnMoreUrl(links) ?? null
        case 'configure':
            return getConfigureUrl(links) ?? getLearnMoreUrl(links) ?? null
        case 'learn_more':
            return getLearnMoreUrl(links) ?? null
        default:
            return null
    }
}

export function isAgentAvailabilityReady(
    availability: AgentAvailability | null | undefined
): availability is AgentAvailability & { status: 'ready' } {
    return availability?.status === 'ready'
}

export function findFirstReadyAgent(availability: readonly AgentAvailability[] | null | undefined): AgentFlavor | null {
    const readyAgent = availability?.find(isAgentAvailabilityReady)
    return readyAgent?.driver ?? null
}
