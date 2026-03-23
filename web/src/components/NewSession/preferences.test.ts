import { beforeEach, describe, expect, it } from 'vitest'
import {
    getDefaultAgentLaunchPreferences,
    loadNewSessionPreferences,
    saveNewSessionPreferences,
} from './preferences'

describe('NewSession preferences', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('loads defaults when storage is empty', () => {
        expect(loadNewSessionPreferences()).toEqual({
            agent: 'claude',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {},
        })
    })

    it('loads saved values from storage', () => {
        localStorage.setItem('viby:newSession:preferences', JSON.stringify({
            agent: 'codex',
            sessionType: 'worktree',
            yoloMode: true,
            agentSettings: {
                codex: {
                    model: 'gpt-5.4-mini',
                    modelReasoningEffort: 'high',
                }
            }
        }))

        expect(loadNewSessionPreferences()).toEqual({
            agent: 'codex',
            sessionType: 'worktree',
            yoloMode: true,
            agentSettings: {
                codex: {
                    model: 'gpt-5.4-mini',
                    modelReasoningEffort: 'high',
                }
            }
        })
    })

    it('falls back to defaults when storage contains invalid values', () => {
        localStorage.setItem('viby:newSession:preferences', JSON.stringify({
            agent: 'unknown-agent',
            sessionType: 'unknown-type',
            yoloMode: 'yes',
            agentSettings: {
                codex: {
                    model: 'not-a-real-model',
                    modelReasoningEffort: 'very-high',
                }
            }
        }))

        expect(loadNewSessionPreferences()).toEqual({
            agent: 'claude',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {
                codex: getDefaultAgentLaunchPreferences('codex')
            }
        })
    })

    it('persists the full new session preference snapshot', () => {
        saveNewSessionPreferences({
            agent: 'gemini',
            sessionType: 'simple',
            yoloMode: true,
            agentSettings: {
                gemini: {
                    model: 'gemini-2.5-pro',
                    modelReasoningEffort: 'default',
                },
                codex: {
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                }
            }
        })

        expect(localStorage.getItem('viby:newSession:preferences')).toBe(JSON.stringify({
            agent: 'gemini',
            sessionType: 'simple',
            yoloMode: true,
            agentSettings: {
                gemini: {
                    model: 'gemini-2.5-pro',
                    modelReasoningEffort: 'default',
                },
                codex: {
                    model: 'gpt-5.4',
                    modelReasoningEffort: 'medium',
                }
            }
        }))
    })
})
