import { describe, expect, it } from 'vitest'
import { MessageMetaSchema } from '@viby/protocol/schemas'
import {
    buildManagerPromptContract,
    buildMemberPromptContract,
    mergePromptSegments,
    prependPromptInstructionsToMessage,
    resolveTeamRolePromptContract
} from './teamPromptContract'

describe('teamPromptContract', () => {
    it('builds a manager contract that keeps the session on orchestration duties', () => {
        const prompt = buildManagerPromptContract()

        expect(prompt).toContain('orchestration')
        expect(prompt).toContain('team_get_snapshot')
        expect(prompt).toContain('compactBrief')
        expect(prompt).toContain('not default implementation')
        expect(prompt).toContain('final acceptance')
    })

    it('builds a member contract with authoritative custom role details', () => {
        const prompt = buildMemberPromptContract({
            prototype: 'reviewer',
            roleId: 'reviewer-mobile',
            roleName: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions and pwa-safe interactions.'
        })

        expect(prompt).toContain('role prototype is "reviewer"')
        expect(prompt).toContain('reviewer-mobile')
        expect(prompt).toContain('Mobile Reviewer')
        expect(prompt).toContain('append-only specialization')
        expect(prompt).toContain('pwa-safe interactions')
    })

    it('resolves the manager contract from session team context', () => {
        const prompt = resolveTeamRolePromptContract({
            sessionRole: 'manager'
        })

        expect(prompt).toContain('manager session')
        expect(prompt).toContain('orchestration')
        expect(prompt).toContain('final acceptance')
    })

    it('resolves the member contract from session team context with custom role metadata', () => {
        const prompt = resolveTeamRolePromptContract({
            sessionRole: 'member',
            memberRole: 'debugger',
            memberRoleId: 'debugger-root-cause',
            memberRoleName: 'Root Cause Debugger',
            memberRolePromptExtension: 'Always verify the failing path with a focused reproduction first.'
        })

        expect(prompt).toContain('role prototype is "debugger"')
        expect(prompt).toContain('debugger-root-cause')
        expect(prompt).toContain('Root Cause Debugger')
        expect(prompt).toContain('focused reproduction first')
    })

    it('rejects member team context without a valid member role', () => {
        expect(() => resolveTeamRolePromptContract({
            sessionRole: 'member'
        })).toThrow('memberRole')
    })

    it('merges prompt segments without keeping empty fragments', () => {
        expect(mergePromptSegments(
            'Base contract',
            '  ',
            undefined,
            'Extra instruction'
        )).toBe(['Base contract', 'Extra instruction'].join('\n\n'))
    })

    it('prepends session instructions ahead of the user message when needed', () => {
        const message = prependPromptInstructionsToMessage(
            'Ship the feature',
            'Stay inside manager duties.'
        )

        expect(message).toContain('Session instructions:')
        expect(message).toContain('Stay inside manager duties.')
        expect(message).toContain('User message:')
        expect(message).toContain('Ship the feature')
    })

    it('requires the full typed contract when team message metadata is present', () => {
        expect(() => MessageMetaSchema.parse({
            sentFrom: 'manager',
            teamProjectId: 'project-1',
            teamMessageKind: 'task-assign'
        })).toThrow()

        expect(MessageMetaSchema.parse({
            sentFrom: 'manager',
            teamProjectId: 'project-1',
            managerSessionId: 'manager-session-1',
            memberId: 'member-1',
            sessionRole: 'member',
            teamMessageKind: 'task-assign',
            controlOwner: 'manager'
        })).toMatchObject({
            sentFrom: 'manager',
            teamProjectId: 'project-1',
            managerSessionId: 'manager-session-1',
            memberId: 'member-1',
            sessionRole: 'member',
            teamMessageKind: 'task-assign',
            controlOwner: 'manager'
        })
    })
})
