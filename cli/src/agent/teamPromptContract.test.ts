import { describe, expect, it } from 'vitest'
import { MessageMetaSchema } from '@viby/protocol/schemas'
import {
    buildManagerPromptContract,
    buildMemberPromptContract,
    mergePromptSegments,
    resolveTeamRolePromptContract
} from './teamPromptContract'

describe('teamPromptContract', () => {
    it('builds a manager contract that keeps the session on orchestration duties', () => {
        const prompt = buildManagerPromptContract()

        expect(prompt).toContain('orchestration')
        expect(prompt).toContain('not default implementation')
        expect(prompt).toContain('final acceptance')
    })

    it('builds a member contract with role-specific focus', () => {
        const prompt = buildMemberPromptContract('reviewer')

        expect(prompt).toContain('role prototype is "reviewer"')
        expect(prompt).toContain('accept/request_changes')
    })

    it('resolves the manager contract from session team context', () => {
        const prompt = resolveTeamRolePromptContract({
            sessionRole: 'manager'
        })

        expect(prompt).toContain('manager session')
        expect(prompt).toContain('orchestration')
        expect(prompt).toContain('final acceptance')
    })

    it('resolves the member contract from session team context', () => {
        const prompt = resolveTeamRolePromptContract({
            sessionRole: 'member',
            memberRole: 'debugger'
        })

        expect(prompt).toContain('role prototype is "debugger"')
        expect(prompt).toContain('定位根因')
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
        )).toBe('Base contract\n\nExtra instruction')
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
