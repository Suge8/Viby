import { describe, expect, it } from 'bun:test'
import { getLiveSessionConfigSupport } from './sessionConfigSupport'

describe('getLiveSessionConfigSupport', () => {
    it('enables live model, reasoning, and collaboration config for remote Codex sessions', () => {
        expect(getLiveSessionConfigSupport({
            active: true,
            metadata: { flavor: 'codex' } as never,
            agentState: { controlledByUser: false } as never,
        })).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: true,
            canChangeModel: true,
            canChangeModelReasoningEffort: true,
        })
    })

    it('disables live config for locally controlled sessions', () => {
        expect(getLiveSessionConfigSupport({
            active: true,
            metadata: { flavor: 'codex' } as never,
            agentState: { controlledByUser: true } as never,
        })).toEqual({
            isRemoteManaged: false,
            canChangePermissionMode: false,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })

    it('keeps permission mode for remote Claude but disables model hot switching', () => {
        expect(getLiveSessionConfigSupport({
            active: true,
            metadata: { flavor: 'claude' } as never,
            agentState: { controlledByUser: false } as never,
        })).toEqual({
            isRemoteManaged: true,
            canChangePermissionMode: true,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })

    it('disables all live config when the session is inactive', () => {
        expect(getLiveSessionConfigSupport({
            active: false,
            metadata: { flavor: 'codex' } as never,
            agentState: { controlledByUser: false } as never,
        })).toEqual({
            isRemoteManaged: false,
            canChangePermissionMode: false,
            canChangeCollaborationMode: false,
            canChangeModel: false,
            canChangeModelReasoningEffort: false,
        })
    })
})
