import { resolveGeminiRuntimeConfig } from '@/gemini/utils/config'
import { type AgentAvailabilityDetector, createAvailability } from './availabilityTypes'
import { createCommandAvailabilityDetector } from './commandAvailability'

const detectGeminiCommandAvailability = createCommandAvailabilityDetector('gemini', ['gemini'])

export const detectGeminiAvailability: AgentAvailabilityDetector = async ({ detectedAt, forceRefresh }) => {
    const commandAvailability = await detectGeminiCommandAvailability({ detectedAt, forceRefresh })
    if (commandAvailability.status !== 'ready') {
        return commandAvailability
    }

    const runtimeConfig = resolveGeminiRuntimeConfig()
    if (!runtimeConfig.token) {
        return createAvailability({
            driver: 'gemini',
            status: 'setup_required',
            resolution: 'configure',
            code: 'auth_missing',
            detectedAt,
            reason: 'Gemini CLI is installed but no local auth or API key was found.',
        })
    }

    return commandAvailability
}
