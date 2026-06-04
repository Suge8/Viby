import type { AgentFlavor } from '@viby/protocol'
import { resolveFirstAvailableCommand } from '@/utils/commandPath'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

export function createCommandAvailabilityDetector(
    driver: AgentFlavor,
    commandCandidates: readonly string[]
): AgentAvailabilityDetector {
    return ({ detectedAt, forceRefresh }) => {
        const resolvedCommand = resolveFirstAvailableCommand(commandCandidates, {
            bypassCache: forceRefresh,
        })
        if (resolvedCommand) {
            return createAvailability({
                driver,
                status: 'ready',
                resolution: 'none',
                code: 'ready',
                detectedAt,
            })
        }

        return createAvailability({
            driver,
            status: 'not_installed',
            resolution: 'install',
            code: 'command_missing',
            detectedAt,
            reason: `${commandCandidates[0] ?? driver} command not found`,
        })
    }
}
