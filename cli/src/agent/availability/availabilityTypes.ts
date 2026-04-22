import type { AgentAvailability, AgentAvailabilityCode } from '@viby/protocol'

export type AgentAvailabilityDetector = (options: {
    detectedAt: number
    directory?: string
    forceRefresh?: boolean
}) => AgentAvailability | Promise<AgentAvailability>

export function createAvailability(
    options: Pick<AgentAvailability, 'driver' | 'status' | 'resolution' | 'detectedAt'> & {
        code: AgentAvailabilityCode
        reason?: string
    }
): AgentAvailability {
    return {
        driver: options.driver,
        status: options.status,
        resolution: options.resolution,
        code: options.code,
        ...(options.reason ? { reason: options.reason } : {}),
        detectedAt: options.detectedAt,
    }
}
