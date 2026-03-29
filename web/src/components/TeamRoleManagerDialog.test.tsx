import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TEAM_PRESET_SCHEMA_VERSION } from '@viby/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeamProjectSnapshot, TeamRoleDefinition } from '@/types/api'
import { TeamRoleManagerDialog } from './TeamRoleManagerDialog'

function createBuiltInRole(prototype: TeamRoleDefinition['prototype']): TeamRoleDefinition {
    return {
        projectId: 'project-1',
        id: prototype,
        source: 'builtin',
        prototype,
        name: prototype,
        promptExtension: null,
        providerFlavor: prototype === 'designer' ? 'gemini' : 'codex',
        model: null,
        reasoningEffort: null,
        isolationMode: prototype === 'implementer' ? 'worktree' : 'simple',
        createdAt: 1_000,
        updatedAt: 1_000,
    }
}

function createCustomRole(): TeamRoleDefinition {
    return {
        projectId: 'project-1',
        id: 'reviewer-mobile',
        source: 'custom',
        prototype: 'reviewer',
        name: 'Mobile Reviewer',
        promptExtension: 'Focus on mobile regressions.',
        providerFlavor: 'codex',
        model: 'gpt-5.4',
        reasoningEffort: 'high',
        isolationMode: 'simple',
        createdAt: 2_000,
        updatedAt: 2_000,
    }
}

function createSnapshot(overrides?: {
    customRoles?: TeamRoleDefinition[]
    memberCount?: number
    taskCount?: number
}): TeamProjectSnapshot {
    const customRoles = overrides?.customRoles ?? []
    const memberCount = overrides?.memberCount ?? 0
    const taskCount = overrides?.taskCount ?? 0
    return {
        project: {
            id: 'project-1',
            managerSessionId: 'manager-session-1',
            machineId: 'machine-1',
            rootDirectory: '/tmp/project',
            title: 'Manager Project',
            goal: 'Ship manager teams',
            status: 'active',
            maxActiveMembers: 6,
            defaultIsolationMode: 'hybrid',
            createdAt: 1_000,
            updatedAt: 2_000,
            deliveredAt: null,
            archivedAt: null,
        },
        roles: [
            createBuiltInRole('implementer'),
            createBuiltInRole('reviewer'),
            ...customRoles,
        ],
        members: Array.from({ length: memberCount }, (_, index) => ({
            id: `member-${index + 1}`,
            projectId: 'project-1',
            sessionId: `member-session-${index + 1}`,
            managerSessionId: 'manager-session-1',
            role: 'implementer' as const,
            roleId: 'implementer',
            providerFlavor: 'codex' as const,
            model: 'gpt-5.4',
            reasoningEffort: 'high' as const,
            isolationMode: 'worktree' as const,
            workspaceRoot: '/tmp/project/worktrees/member',
            controlOwner: 'manager' as const,
            membershipState: 'active' as const,
            revision: 1,
            supersedesMemberId: null,
            supersededByMemberId: null,
            spawnedForTaskId: null,
            createdAt: 1_200,
            updatedAt: 1_200,
            archivedAt: null,
            removedAt: null,
        })),
        tasks: Array.from({ length: taskCount }, (_, index) => ({
            id: `task-${index + 1}`,
            projectId: 'project-1',
            parentTaskId: null,
            title: `Task ${index + 1}`,
            description: null,
            acceptanceCriteria: null,
            status: 'todo' as const,
            assigneeMemberId: null,
            reviewerMemberId: null,
            verifierMemberId: null,
            priority: null,
            dependsOn: [],
            retryCount: 0,
            createdAt: 1_300,
            updatedAt: 1_300,
            completedAt: null,
        })),
        events: [],
        acceptance: {
            tasks: {},
            recentResults: [],
        },
        compactBrief: {
            project: {
                id: 'project-1',
                title: 'Manager Project',
                goal: 'Ship manager teams',
                status: 'active',
                maxActiveMembers: 6,
                defaultIsolationMode: 'hybrid',
                updatedAt: 2_000,
                deliveredAt: null,
            },
            summary: 'Project "Manager Project" has active members and open tasks.',
            counts: {
                activeMemberCount: memberCount,
                inactiveMemberCount: 0,
                openTaskCount: taskCount,
                blockedTaskCount: 0,
                reviewFailedTaskCount: 0,
                verificationFailedTaskCount: 0,
                readyForManagerAcceptanceCount: 0,
                deliveryReady: false,
            },
            staffing: {
                seatPressure: 'available',
                remainingMemberSlots: Math.max(6 - memberCount, 0),
                hints: [],
            },
            activeMembers: [],
            inactiveMembers: [],
            openTasks: [],
            recentEvents: [],
            recentAcceptanceResults: [],
            wakeReasons: [],
            nextActions: [],
        },
    }
}

function createPreset() {
    return {
        schemaVersion: TEAM_PRESET_SCHEMA_VERSION,
        projectSettings: {
            maxActiveMembers: 4,
            defaultIsolationMode: 'all_simple' as const,
        },
        roles: [{
            id: 'reviewer-mobile',
            prototype: 'reviewer' as const,
            name: 'Mobile Reviewer',
            promptExtension: 'Focus on mobile regressions.',
            providerFlavor: 'codex' as const,
            model: 'gpt-5.4',
            reasoningEffort: 'high' as const,
            isolationMode: 'simple' as const,
        }],
    }
}

function renderDialog(options?: {
    snapshot?: TeamProjectSnapshot
    api?: Record<string, ReturnType<typeof vi.fn>>
    onSnapshotChanged?: ReturnType<typeof vi.fn<() => Promise<unknown>>>
}) {
    const onSnapshotChanged = options?.onSnapshotChanged
        ?? vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined)
    const api = {
        createTeamRole: vi.fn(async () => createCustomRole()),
        updateTeamRole: vi.fn(async () => createCustomRole()),
        deleteTeamRole: vi.fn(async () => 'reviewer-mobile'),
        getTeamProjectPreset: vi.fn(async () => createPreset()),
        applyTeamProjectPreset: vi.fn(async () => createSnapshot({ customRoles: [createCustomRole()] })),
        ...options?.api,
    }
    const view = render(
        <TeamRoleManagerDialog
            api={api as never}
            open
            onOpenChange={() => undefined}
            snapshot={options?.snapshot ?? createSnapshot()}
            managerSessionId="manager-session-1"
            onSnapshotChanged={onSnapshotChanged}
        />,
    )

    return {
        ...view,
        api,
        onSnapshotChanged,
    }
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('TeamRoleManagerDialog', () => {
    it('creates a custom role from the authoritative manager surface', async () => {
        const { api, onSnapshotChanged } = renderDialog()

        fireEvent.click(screen.getByRole('button', { name: '新建 custom role' }))
        fireEvent.change(screen.getByLabelText('Role id'), {
            target: { value: 'mobile-reviewer' },
        })
        fireEvent.change(screen.getByLabelText('Display name'), {
            target: { value: 'Mobile Reviewer' },
        })
        fireEvent.change(screen.getByLabelText('Prompt extension'), {
            target: { value: 'Focus on mobile regressions.' },
        })
        fireEvent.click(screen.getByRole('button', { name: '创建角色' }))

        await waitFor(() => {
            expect(api.createTeamRole).toHaveBeenCalledWith('project-1', {
                managerSessionId: 'manager-session-1',
                roleId: 'mobile-reviewer',
                prototype: 'implementer',
                name: 'Mobile Reviewer',
                promptExtension: 'Focus on mobile regressions.',
                providerFlavor: 'codex',
                model: null,
                reasoningEffort: null,
                isolationMode: 'worktree',
            })
        })
        expect(onSnapshotChanged).toHaveBeenCalledTimes(1)
    })

    it('edits and deletes existing custom roles through the same surface', async () => {
        const customRole = createCustomRole()
        const { api, onSnapshotChanged } = renderDialog({
            snapshot: createSnapshot({ customRoles: [customRole] }),
        })
        vi.stubGlobal('confirm', vi.fn(() => true))

        fireEvent.click(screen.getByRole('button', { name: '编辑' }))
        fireEvent.change(screen.getByLabelText('Display name'), {
            target: { value: 'Mobile Review Lead' },
        })
        fireEvent.click(screen.getByRole('button', { name: '保存角色' }))

        await waitFor(() => {
            expect(api.updateTeamRole).toHaveBeenCalledWith('project-1', 'reviewer-mobile', {
                managerSessionId: 'manager-session-1',
                name: 'Mobile Review Lead',
                promptExtension: 'Focus on mobile regressions.',
                providerFlavor: 'codex',
                model: 'gpt-5.4',
                reasoningEffort: 'high',
                isolationMode: 'simple',
            })
        })

        fireEvent.click(screen.getByRole('button', { name: '删除' }))

        await waitFor(() => {
            expect(api.deleteTeamRole).toHaveBeenCalledWith('project-1', 'reviewer-mobile', {
                managerSessionId: 'manager-session-1',
            })
        })
        expect(onSnapshotChanged).toHaveBeenCalledTimes(2)
    })

    it('exports presets and wires the import trigger without keeping a local cache', async () => {
        const preset = createPreset()
        const createObjectURL = vi.fn(() => 'blob:role-preset')
        const revokeObjectURL = vi.fn()
        const linkClick = vi.fn()
        Object.defineProperty(window.URL, 'createObjectURL', {
            writable: true,
            value: createObjectURL,
        })
        Object.defineProperty(window.URL, 'revokeObjectURL', {
            writable: true,
            value: revokeObjectURL,
        })
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(linkClick)

        const { api, onSnapshotChanged } = renderDialog({
            api: {
                getTeamProjectPreset: vi.fn(async () => preset),
                applyTeamProjectPreset: vi.fn(async () => createSnapshot({ customRoles: [createCustomRole()] })),
            },
        })

        fireEvent.click(screen.getByRole('button', { name: '导出 preset' }))
        await waitFor(() => {
            expect(api.getTeamProjectPreset).toHaveBeenCalledWith('project-1')
        })
        expect(createObjectURL).toHaveBeenCalledTimes(1)
        expect(linkClick).toHaveBeenCalledTimes(1)
        expect(revokeObjectURL).toHaveBeenCalledTimes(1)

        const importInputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)

        fireEvent.click(screen.getByRole('button', { name: '导入 preset' }))

        expect(importInputClick).toHaveBeenCalledTimes(1)
        expect(api.applyTeamProjectPreset).not.toHaveBeenCalled()
        expect(onSnapshotChanged).not.toHaveBeenCalled()
    })

    it('blocks preset import once durable members already exist', () => {
        renderDialog({
            snapshot: createSnapshot({ memberCount: 1 }),
        })

        expect(screen.getByText('只有在还没有 durable 成员时才能导入 preset。')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '导入 preset' })).toBeDisabled()
    })
})
