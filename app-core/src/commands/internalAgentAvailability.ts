import {
    AgentAvailabilityResponseSchema,
    type ListAgentAvailabilityRequest,
    ListAgentAvailabilityRequestSchema,
} from '@viby/protocol'
import { listAgentAvailability } from '@/agent/agentAvailability'
import type { CommandDefinition } from './types'

export const INTERNAL_AGENT_AVAILABILITY_COMMAND = '__internal_agent_availability'

export function parseInternalAgentAvailabilityArgs(args: readonly string[]): ListAgentAvailabilityRequest {
    const request: Record<string, unknown> = {}

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--force-refresh') {
            request.forceRefresh = true
            continue
        }

        if (arg === '--directory') {
            const directory = args[index + 1]
            if (!directory) {
                throw new Error('--directory requires a value.')
            }
            request.directory = directory
            index += 1
            continue
        }

        if (arg === '--drivers') {
            const drivers = args[index + 1]
            if (!drivers) {
                throw new Error('--drivers requires a value.')
            }
            request.drivers = drivers
            index += 1
            continue
        }

        throw new Error(`Unknown ${INTERNAL_AGENT_AVAILABILITY_COMMAND} argument: ${arg}`)
    }

    return ListAgentAvailabilityRequestSchema.parse(request)
}

export const internalAgentAvailabilityCommand: CommandDefinition = {
    name: INTERNAL_AGENT_AVAILABILITY_COMMAND,
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        const request = parseInternalAgentAvailabilityArgs(commandArgs)
        const response = AgentAvailabilityResponseSchema.parse(await listAgentAvailability(request))
        process.stdout.write(`${JSON.stringify(response)}\n`)
    },
}
