import { describe, expect, it } from 'bun:test'
import type { Session } from '@viby/protocol/types'
import { normalizeDriverSwitchConfig } from './sessionSwitchConfig'

function createSession(
    overrides: Partial<Pick<Session, 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'>> = {}
): Pick<Session, 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'> {
    return {
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'plan',
        ...overrides,
    }
}

describe('normalizeDriverSwitchConfig', () => {
    it('preserves same-driver codex config when every field stays compatible', () => {
        const session = createSession()

        expect(normalizeDriverSwitchConfig(session, 'codex')).toEqual({
            durableConfig: {
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            },
            spawnConfig: {
                model: 'gpt-5.4',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
                collaborationMode: 'plan',
            },
        })
    })

    it('clears incompatible cross-driver codex config while keeping shared settings', () => {
        const session = createSession({ permissionMode: 'default' })

        expect(normalizeDriverSwitchConfig(session, 'claude')).toEqual({
            durableConfig: {
                model: null,
                modelReasoningEffort: 'high',
                permissionMode: 'default',
                collaborationMode: null,
            },
            spawnConfig: {
                model: undefined,
                modelReasoningEffort: 'high',
                permissionMode: 'default',
                collaborationMode: undefined,
            },
        })
    })

    it('preserves a cross-driver model when the target driver supports the same model id', () => {
        const session = createSession({
            model: 'gpt-5.4-mini',
            permissionMode: 'safe-yolo',
            modelReasoningEffort: 'xhigh',
            collaborationMode: 'plan',
        })

        expect(normalizeDriverSwitchConfig(session, 'copilot')).toEqual({
            durableConfig: {
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: null,
            },
            spawnConfig: {
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
            },
        })
    })

    it('preserves a cross-driver model for cursor when the target runtime accepts spawn-time model overrides', () => {
        const session = createSession({
            model: 'gpt-5.4-mini',
            permissionMode: 'safe-yolo',
            modelReasoningEffort: 'xhigh',
            collaborationMode: 'plan',
        })

        expect(normalizeDriverSwitchConfig(session, 'cursor')).toEqual({
            durableConfig: {
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: null,
            },
            spawnConfig: {
                model: 'gpt-5.4-mini',
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
            },
        })
    })

    it('drops malformed and stale values instead of forwarding them to the target runtime', () => {
        const session = createSession({
            model: '   ',
            modelReasoningEffort: 'xhigh' as Session['modelReasoningEffort'],
            permissionMode: 'read-only',
            collaborationMode: 'stale-plan' as Session['collaborationMode'],
        })

        expect(normalizeDriverSwitchConfig(session, 'claude')).toEqual({
            durableConfig: {
                model: null,
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: null,
            },
            spawnConfig: {
                model: undefined,
                modelReasoningEffort: null,
                permissionMode: 'default',
                collaborationMode: undefined,
            },
        })
        expect(normalizeDriverSwitchConfig(session, 'unknown-driver' as never)).toEqual({
            durableConfig: {
                model: undefined,
                modelReasoningEffort: undefined,
                permissionMode: undefined,
                collaborationMode: undefined,
            },
            spawnConfig: {
                model: undefined,
                modelReasoningEffort: undefined,
                permissionMode: undefined,
                collaborationMode: undefined,
            },
        })
    })

    it('does not mutate the source session while normalizing config', () => {
        const session = createSession()
        const snapshot = structuredClone(session)

        void normalizeDriverSwitchConfig(session, 'claude')

        expect(session).toEqual(snapshot)
    })
})
