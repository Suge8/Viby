import type { SessionDriver } from '@viby/protocol'

export const SAME_SESSION_SWITCH_TARGET_DRIVERS = ['claude', 'codex'] as const satisfies readonly SessionDriver[]

export type SameSessionSwitchTargetDriver = (typeof SAME_SESSION_SWITCH_TARGET_DRIVERS)[number]

export function isSameSessionSwitchTargetDriver(value: unknown): value is SameSessionSwitchTargetDriver {
    return typeof value === 'string' && SAME_SESSION_SWITCH_TARGET_DRIVERS.includes(value as SameSessionSwitchTargetDriver)
}

export function assertSameSessionSwitchTargetDriver(
    targetDriver: SessionDriver | null | undefined
): SameSessionSwitchTargetDriver {
    if (!isSameSessionSwitchTargetDriver(targetDriver)) {
        throw new Error('Same-session agent switching requires an explicit Claude or Codex target driver')
    }

    return targetDriver
}

export function getOtherSameSessionSwitchTargetDriver(
    currentDriver: SessionDriver | null | undefined
): SameSessionSwitchTargetDriver | null {
    switch (currentDriver) {
        case 'claude':
            return 'codex'
        case 'codex':
            return 'claude'
        default:
            return null
    }
}
