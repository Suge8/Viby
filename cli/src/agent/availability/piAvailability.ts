import { resolvePiAgentLaunchConfig } from '@/pi/launchConfig'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

export const detectPiAvailability: AgentAvailabilityDetector = async ({ detectedAt, directory }) => {
    try {
        const piLaunchConfig = await resolvePiAgentLaunchConfig(directory ?? process.cwd())
        if (piLaunchConfig.availableModels.length === 0) {
            return createAvailability({
                driver: 'pi',
                status: 'setup_required',
                resolution: 'configure',
                code: 'auth_missing',
                detectedAt,
                reason: 'Pi is available but no authenticated model is configured yet.',
            })
        }

        return createAvailability({
            driver: 'pi',
            status: 'ready',
            resolution: 'none',
            code: 'ready',
            detectedAt,
        })
    } catch (error) {
        return createAvailability({
            driver: 'pi',
            status: 'setup_required',
            resolution: 'configure',
            code: 'config_missing',
            detectedAt,
            reason: error instanceof Error ? error.message : 'Pi is not configured yet.',
        })
    }
}
