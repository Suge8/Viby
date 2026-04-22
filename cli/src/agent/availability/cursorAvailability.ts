import { getDefaultCursorAgentCommand } from '@/cursor/utils/cursorAgentCommand'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

export const detectCursorAvailability: AgentAvailabilityDetector = ({ detectedAt, forceRefresh }) => {
    try {
        getDefaultCursorAgentCommand({ bypassCache: forceRefresh })
        return createAvailability({
            driver: 'cursor',
            status: 'ready',
            resolution: 'none',
            code: 'ready',
            detectedAt,
        })
    } catch (error) {
        return createAvailability({
            driver: 'cursor',
            status: 'not_installed',
            resolution: 'install',
            code: 'command_missing',
            detectedAt,
            reason: error instanceof Error ? error.message : 'Cursor Agent CLI not found',
        })
    }
}
