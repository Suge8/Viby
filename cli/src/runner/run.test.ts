import { describe, expect, it } from 'vitest'

import { buildInternalSessionArgs } from './runArgs'

describe('buildInternalSessionArgs', () => {
    it('forwards Pi first-turn reasoning effort through runner-managed spawn argv', () => {
        expect(
            buildInternalSessionArgs('pi', {
                sessionId: 'session-pi',
                model: 'openai/gpt-5.4-mini',
                modelReasoningEffort: 'high',
                permissionMode: 'safe-yolo',
            })
        ).toEqual([
            '__internal_spawn_session',
            '--agent',
            'pi',
            '--started-by',
            'runner',
            '--viby-session-id',
            'session-pi',
            '--permission-mode',
            'safe-yolo',
            '--model',
            'openai/gpt-5.4-mini',
            '--model-reasoning-effort',
            'high',
        ])
    })

    it('keeps non-supported flags scoped to the drivers that actually support them', () => {
        expect(
            buildInternalSessionArgs('opencode', {
                model: 'ignored-model',
                modelReasoningEffort: 'high',
                collaborationMode: 'plan',
            })
        ).toEqual(['__internal_spawn_session', '--agent', 'opencode', '--started-by', 'runner'])
    })

    it('forwards continuity transport argv for non-Claude/Codex drivers too', () => {
        expect(
            buildInternalSessionArgs('gemini', {
                sessionId: 'session-gemini',
                driverSwitchTransport: {
                    targetDriver: 'gemini',
                    handoffFilePath: '/tmp/handoff.json',
                    cleanup: async () => {},
                },
            })
        ).toEqual([
            '__internal_spawn_session',
            '--agent',
            'gemini',
            '--started-by',
            'runner',
            '--viby-session-id',
            'session-gemini',
            '--driver-switch-target',
            'gemini',
            '--driver-switch-handoff-file',
            '/tmp/handoff.json',
        ])
    })
})
