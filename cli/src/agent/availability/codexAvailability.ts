import { getDefaultCodexPath } from '@/codex/utils/codexPath'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

export const detectCodexAvailability: AgentAvailabilityDetector = ({ detectedAt }) => {
    try {
        getDefaultCodexPath()
        return createAvailability({
            driver: 'codex',
            status: 'ready',
            resolution: 'none',
            code: 'ready',
            detectedAt,
        })
    } catch (error) {
        return createAvailability({
            driver: 'codex',
            status: 'not_installed',
            resolution: 'install',
            code: 'command_missing',
            detectedAt,
            reason: error instanceof Error ? error.message : 'Codex CLI not found',
        })
    }
}
