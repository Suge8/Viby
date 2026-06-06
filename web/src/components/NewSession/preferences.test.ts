import { beforeEach, describe, expect, it } from 'vitest'
import {
    clearNewSessionPreferencesDraft,
    commitNewSessionPreferences,
    loadNewSessionPreferences,
    saveNewSessionPreferencesDraft,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
        sessionStorage.clear()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadNewSessionPreferences()).toEqual({ agent: 'claude', sessionType: 'simple', yoloMode: false })
    })

    it('prefers the newer draft over last-used', () => {
        commitNewSessionPreferences({ agent: 'claude', sessionType: 'simple', yoloMode: false })
        saveNewSessionPreferencesDraft({ agent: 'pi', sessionType: 'worktree', yoloMode: true })

        expect(loadNewSessionPreferences()).toEqual({ agent: 'pi', sessionType: 'worktree', yoloMode: true })
    })

    it('clears old preference snapshots with model settings', () => {
        localStorage.setItem(
            'viby.newSession.lastUsed',
            JSON.stringify({
                agent: 'codex',
                sessionType: 'worktree',
                yoloMode: true,
                agentSettings: { codex: { model: 'auto', modelReasoningEffort: 'default' } },
                savedAt: Date.now(),
            })
        )

        expect(loadNewSessionPreferences()).toEqual({ agent: 'claude', sessionType: 'simple', yoloMode: false })
    })

    it('clears the in-progress draft without touching last-used', () => {
        commitNewSessionPreferences({ agent: 'codex', sessionType: 'simple', yoloMode: false })
        saveNewSessionPreferencesDraft({ agent: 'pi', sessionType: 'worktree', yoloMode: true })

        clearNewSessionPreferencesDraft()

        expect(loadNewSessionPreferences()).toEqual({ agent: 'codex', sessionType: 'simple', yoloMode: false })
    })
})
