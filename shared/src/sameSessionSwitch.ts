import type { AgentAvailability } from './agentAvailability'
import { AGENT_FLAVORS, type AgentFlavor } from './modes'

export const SAME_SESSION_SWITCH_TARGET_DRIVERS = AGENT_FLAVORS

export type SameSessionSwitchTargetDriver = AgentFlavor

export function isSameSessionSwitchTargetDriver(value: unknown): value is SameSessionSwitchTargetDriver {
    return (
        typeof value === 'string' && SAME_SESSION_SWITCH_TARGET_DRIVERS.includes(value as SameSessionSwitchTargetDriver)
    )
}

export function assertSameSessionSwitchTargetDriver(
    targetDriver: AgentFlavor | null | undefined
): SameSessionSwitchTargetDriver {
    if (!isSameSessionSwitchTargetDriver(targetDriver)) {
        throw new Error('Same-session agent switching requires a supported target driver')
    }

    return targetDriver
}

export function getSameSessionSwitchTargetDrivers(
    currentDriver: AgentFlavor | null | undefined
): SameSessionSwitchTargetDriver[] {
    if (!isSameSessionSwitchTargetDriver(currentDriver)) {
        return []
    }

    return SAME_SESSION_SWITCH_TARGET_DRIVERS.filter((driver) => driver !== currentDriver)
}

export function getAvailableSameSessionSwitchTargetDrivers(
    currentDriver: AgentFlavor | null | undefined,
    availability: readonly AgentAvailability[] | null | undefined
): SameSessionSwitchTargetDriver[] {
    const switchTargets = getSameSessionSwitchTargetDrivers(currentDriver)
    if (!availability || availability.length === 0) {
        return switchTargets
    }

    const readyDrivers = new Set(
        availability.filter((candidate) => candidate.status === 'ready').map((candidate) => candidate.driver)
    )

    return switchTargets.filter((driver) => readyDrivers.has(driver))
}
