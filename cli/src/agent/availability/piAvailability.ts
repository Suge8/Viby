import { resolveFirstAvailableCommand } from '@/utils/commandPath'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

function getPiCommandCandidates(): string[] {
    const explicit = process.env.VIBY_PI_PATH?.trim() || process.env.PI_PATH?.trim()
    return explicit ? [explicit] : ['pi']
}

export const detectPiAvailability: AgentAvailabilityDetector = ({ detectedAt, forceRefresh }) => {
    const command = resolveFirstAvailableCommand(getPiCommandCandidates(), { bypassCache: forceRefresh })
    if (command) {
        return createAvailability({
            driver: 'pi',
            status: 'ready',
            resolution: 'none',
            code: 'ready',
            detectedAt,
        })
    }

    return createAvailability({
        driver: 'pi',
        status: 'not_installed',
        resolution: 'install',
        code: 'command_missing',
        detectedAt,
        reason: 'Pi CLI was not found. Install Pi or set VIBY_PI_PATH to the pi executable.',
    })
}
