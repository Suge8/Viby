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
            sessionRole: 'normal',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {},
        })
    })

    it('loads saved values from storage', () => {
        localStorage.setItem('viby:newSession:preferences', JSON.stringify({
            agent: 'codex',
            sessionRole: 'manager',
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
            sessionRole: 'manager',
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

    it('accepts pi as a persisted agent preference', () => {
        localStorage.setItem('viby:newSession:preferences', JSON.stringify({
            agent: 'pi',
            sessionRole: 'normal',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {
                pi: {
                    model: 'auto',
                    modelReasoningEffort: 'default',
                }
            }
        }))

        expect(loadNewSessionPreferences()).toEqual({
            agent: 'pi',
            sessionRole: 'normal',
            sessionType: 'simple',
            yoloMode: false,
            agentSettings: {
                pi: {
                    model: 'auto',
                    modelReasoningEffort: 'default',
                }
            }
        })
    })

    it('falls back to defaults when storage contains invalid values', () => {
        localStorage.setItem('viby:newSession:preferences', JSON.stringify({
            agent: 'unknown-agent',
            sessionRole: 'unknown-role',
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
            sessionRole: 'normal',
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
            sessionRole: 'manager',
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
            sessionRole: 'manager',
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
