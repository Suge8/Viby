import { describe, expect, it } from 'bun:test'
import type { Session } from '@viby/protocol/types'
import { normalizeDriverSwitchSpawnConfig } from './sessionSwitchConfig'

function createSession(
    overrides: Partial<Pick<Session, 'metadata' | 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'>> = {}
): Pick<Session, 'metadata' | 'model' | 'modelReasoningEffort' | 'permissionMode' | 'collaborationMode'> {
    return {
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            driver: 'codex',
        },
        model: 'gpt-5.4',
        modelReasoningEffort: 'high',
        permissionMode: 'safe-yolo',
        collaborationMode: 'plan',
        ...overrides,
    }
}

describe('normalizeDriverSwitchSpawnConfig', () => {
    it('preserves same-driver codex config when every field stays compatible', () => {
        const session = createSession()

        expect(normalizeDriverSwitchSpawnConfig(session, 'codex')).toEqual({
            model: 'gpt-5.4',
            modelReasoningEffort: 'high',
            permissionMode: 'safe-yolo',
            collaborationMode: 'plan',
        })
    })

    it('clears cross-driver codex config while keeping shared permission mode', () => {
        const session = createSession({ permissionMode: 'default' })

        expect(normalizeDriverSwitchSpawnConfig(session, 'claude')).toEqual({
            model: undefined,
            modelReasoningEffort: undefined,
            permissionMode: 'default',
            collaborationMode: undefined,
        })
    })

    it('drops malformed and stale values instead of forwarding them to the target runtime', () => {
        const session = createSession({
            model: '   ',
            modelReasoningEffort: 'xhigh' as Session['modelReasoningEffort'],
            permissionMode: 'read-only',
            collaborationMode: 'stale-plan' as Session['collaborationMode'],
        })

        expect(normalizeDriverSwitchSpawnConfig(session, 'claude')).toEqual({
            model: undefined,
            modelReasoningEffort: undefined,
            permissionMode: undefined,
            collaborationMode: undefined,
        })
        expect(normalizeDriverSwitchSpawnConfig(session, 'unknown-driver' as never)).toEqual({
            model: undefined,
            modelReasoningEffort: undefined,
            permissionMode: undefined,
            collaborationMode: undefined,
        })
    })

    it('does not mutate the source session while normalizing config', () => {
        const session = createSession()
        const snapshot = structuredClone(session)

        void normalizeDriverSwitchSpawnConfig(session, 'claude')

        expect(session).toEqual(snapshot)
    })
})
