import { getDefaultClaudeCodePath } from '@/claude/sdk/utils'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

export const detectClaudeAvailability: AgentAvailabilityDetector = ({ detectedAt }) => {
    try {
        getDefaultClaudeCodePath()
        return createAvailability({
            driver: 'claude',
            status: 'ready',
            resolution: 'none',
            code: 'ready',
            detectedAt,
        })
    } catch (error) {
        return createAvailability({
            driver: 'claude',
            status: 'not_installed',
            resolution: 'install',
            code: 'command_missing',
            detectedAt,
            reason: error instanceof Error ? error.message : 'Claude Code CLI not found',
        })
    }
}
