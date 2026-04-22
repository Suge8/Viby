import { describe, expect, it } from 'bun:test'
import { getLiveSessionConfigSupport } from './sessionConfigSupport'

describe('getLiveSessionConfigSupport', () => {
    it('matches the live-config support matrix for all seven session drivers', () => {
        const expectations = {
            claude: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: true,
            },
            codex: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: true,
                canChangeModel: true,
                canChangeModelReasoningEffort: true,
            },
            gemini: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: false,
            },
            opencode: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: false,
                canChangeModelReasoningEffort: false,
            },
            cursor: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: false,
                canChangeModelReasoningEffort: false,
            },
            pi: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: true,
            },
            copilot: {
                isRemoteManaged: true,
                canChangePermissionMode: true,
                canChangeCollaborationMode: false,
                canChangeModel: true,
                canChangeModelReasoningEffort: false,
            },
        } as const

        for (const [driver, expected] of Object.entries(expectations)) {
            expect(
                getLiveSessionConfigSupport({
                    active: true,
                    metadata: { driver } as never,
                    agentState: { controlledByUser: false } as never,
                })
            ).toEqual(expected)
        }
    })

    it('enables live model, reasoning, and collaboration config for remote Codex sessions', () => {
        expect(
            getLiveSessionConfigSupport({
                active: true,
                metadata: {
                    driver: 'codex',
                    runtimeHandles: {
                        codex: { sessionId: 'codex-session' },
                    },
                } as never,
                agentState: { controlledByUser: false } as never,
            })
        ).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: true,
            canChangeModel: true,
            canChangeModelReasoningEffort: true,
        })
    })

    it('uses the explicit driver for Claude sessions', () => {
        expect(
            getLiveSessionConfigSupport({
                active: true,
                metadata: { driver: 'claude' } as never,
                agentState: { controlledByUser: false } as never,
            })
        ).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: false,
            canChangeModel: true,
            canChangeModelReasoningEffort: true,
        })
    })

    it('enables live model and reasoning config for remote Pi sessions', () => {
        expect(
            getLiveSessionConfigSupport({
                active: true,
                metadata: {
                    driver: 'pi',
                    runtimeHandles: {
                        pi: { sessionId: 'pi-runtime-1' },
                    },
                } as never,
                agentState: { controlledByUser: false } as never,
            })
        ).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: false,
            canChangeModel: true,
            canChangeModelReasoningEffort: true,
        })
    })

    it('disables live config for locally controlled sessions', () => {
        expect(
            getLiveSessionConfigSupport({
                active: true,
                metadata: { driver: 'codex' } as never,
                agentState: { controlledByUser: true } as never,
            })
        ).toEqual({
            isRemoteManaged: false,
            canChangePermissionMode: false,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })

    it('disables unsupported or malformed drivers instead of inventing defaults', () => {
        expect(
            getLiveSessionConfigSupport({
                active: true,
                metadata: { driver: 'unknown' } as never,
                agentState: { controlledByUser: false } as never,
            })
        ).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: false,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })

    it('disables all live config when the session is inactive', () => {
        expect(
            getLiveSessionConfigSupport({
                active: false,
                metadata: { driver: 'gemini' } as never,
                agentState: { controlledByUser: false } as never,
            })
        ).toEqual({
            isRemoteManaged: false,
            canChangePermissionMode: false,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })
})
