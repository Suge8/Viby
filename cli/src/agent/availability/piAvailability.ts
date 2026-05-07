import { resolvePiAgentLaunchConfig } from '@/pi/launchConfig'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'

function isPiCommandMissing(error: unknown): boolean {
    return error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('command not found'))
}

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
        if (isPiCommandMissing(error)) {
            return createAvailability({
                driver: 'pi',
                status: 'not_installed',
                resolution: 'install',
                code: 'command_missing',
                detectedAt,
                reason: 'Pi CLI was not found. Install Pi or set VIBY_PI_PATH to the pi executable.',
            })
        }

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
