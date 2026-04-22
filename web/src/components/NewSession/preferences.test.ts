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
        expect(loadNewSessionPreferences()).toEqual({
            agent: 'claude',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {},
        })
    })

    it('prefers the newer draft over last-used', () => {
        commitNewSessionPreferences({
            agent: 'claude',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {
                claude: {
                    model: 'sonnet',
                    modelReasoningEffort: 'high',
                },
            },
        })
        saveNewSessionPreferencesDraft({
            agent: 'pi',
            sessionType: 'worktree',
            yoloMode: true,
            agentSettings: {
                pi: {
                    model: 'openai/gpt-5.4',
                    modelReasoningEffort: 'high',
                },
            },
        })

        expect(loadNewSessionPreferences()).toMatchObject({
            agent: 'pi',
            sessionType: 'worktree',
            yoloMode: true,
        })
    })

    it('clears the in-progress draft without touching last-used', () => {
        commitNewSessionPreferences({
            agent: 'codex',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {},
        })
        saveNewSessionPreferencesDraft({
            agent: 'pi',
            sessionType: 'worktree',
            yoloMode: true,
            agentSettings: {},
        })

        clearNewSessionPreferencesDraft()

        expect(loadNewSessionPreferences()).toMatchObject({
            agent: 'codex',
            sessionType: 'simple',
            yoloMode: false,
        })
    })
})
