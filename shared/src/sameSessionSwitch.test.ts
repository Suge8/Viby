import { describe, expect, it } from 'bun:test'
import {
    assertSameSessionSwitchTargetDriver,
    getAvailableSameSessionSwitchTargetDrivers,
    getSameSessionSwitchTargetDrivers,
    isSameSessionSwitchTargetDriver,
} from './sameSessionSwitch'

describe('sameSessionSwitch', () => {
    it('accepts all supported drivers as same-session switch targets', () => {
        expect(isSameSessionSwitchTargetDriver('claude')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('codex')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('gemini')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('opencode')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('cursor')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('pi')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('copilot')).toBe(true)
        expect(isSameSessionSwitchTargetDriver('unknown')).toBe(false)
    })

    it('lists all alternative targets except the current driver', () => {
        expect(getSameSessionSwitchTargetDrivers('codex')).toEqual([
            'claude',
            'gemini',
            'opencode',
            'cursor',
            'pi',
            'copilot',
        ])
        expect(getSameSessionSwitchTargetDrivers('pi')).toEqual([
            'claude',
            'codex',
            'gemini',
            'opencode',
            'cursor',
            'copilot',
        ])
        expect(getSameSessionSwitchTargetDrivers(null)).toEqual([])
        expect(getSameSessionSwitchTargetDrivers(undefined)).toEqual([])
    })

    it('throws for unsupported switch targets', () => {
        expect(assertSameSessionSwitchTargetDriver('claude')).toBe('claude')
        expect(() => assertSameSessionSwitchTargetDriver(null)).toThrow(
            'Same-session agent switching requires a supported target driver'
        )
    })

    it('filters switch targets by ready availability when provided', () => {
        expect(
            getAvailableSameSessionSwitchTargetDrivers('codex', [
                {
                    driver: 'claude',
                    status: 'ready',
                    resolution: 'none',
                    code: 'ready',
                    detectedAt: 1,
                },
                {
                    driver: 'gemini',
                    status: 'not_installed',
                    resolution: 'install',
                    code: 'command_missing',
                    detectedAt: 1,
                },
                {
                    driver: 'cursor',
                    status: 'ready',
                    resolution: 'none',
                    code: 'ready',
                    detectedAt: 1,
                },
            ])
        ).toEqual(['claude', 'cursor'])
    })
})
