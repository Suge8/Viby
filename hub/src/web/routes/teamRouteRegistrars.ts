import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import {
    acceptTaskBodySchema,
    applyPresetBodySchema,
    closeProjectBodySchema,
    createRoleBodySchema,
    createTaskBodySchema,
    deleteRoleBodySchema,
    interjectBodySchema,
    messageMemberBodySchema,
    reviewRequestBodySchema,
    reviewResultBodySchema,
    spawnMemberBodySchema,
    updateMemberBodySchema,
    updateProjectSettingsBodySchema,
    updateRoleBodySchema,
    updateTaskBodySchema,
    verificationRequestBodySchema,
    verificationResultBodySchema,
} from './teamRouteSchemas'
import {
    executeTeamAction,
    executeTeamActionWithBody,
    readTeamProjectResource,
} from './teamRouteSupport'

type TeamRouteApp = Hono<WebAppEnv>
type GetSyncEngine = () => SyncEngine | null

export function registerTeamProjectRoutes(app: TeamRouteApp, getSyncEngine: GetSyncEngine): void {
    app.get('/team-projects/:projectId', (c) => readTeamProjectResource(
        c,
        getSyncEngine,
        (engine) => engine.getTeamProjectSnapshot(c.req.param('projectId')),
    ))

    app.get('/team-projects/:projectId/history', (c) => readTeamProjectResource(
        c,
        getSyncEngine,
        (engine) => engine.getTeamProjectHistory(c.req.param('projectId')),
    ))

    app.get('/team-projects/:projectId/preset', (c) => readTeamProjectResource(
        c,
        getSyncEngine,
        async (engine) => {
            const projectId = c.req.param('projectId')
            const snapshot = engine.getTeamProjectSnapshot(projectId)
            if (!snapshot) {
                return null
            }

            return await engine.exportTeamProjectPreset({
                managerSessionId: snapshot.project.managerSessionId,
                projectId,
            })
        },
    ))

    app.put('/team-projects/:projectId/preset', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        applyPresetBodySchema,
        async (engine, body) => await engine.importTeamProjectPreset({
            managerSessionId: body.managerSessionId,
            projectId: c.req.param('projectId'),
            preset: body.preset,
        }),
    ))

    app.patch('/team-projects/:projectId/settings', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        updateProjectSettingsBodySchema,
        async (engine, body) => await engine.updateTeamProjectSettings({
            managerSessionId: body.managerSessionId,
            projectId: c.req.param('projectId'),
            maxActiveMembers: body.maxActiveMembers,
            defaultIsolationMode: body.defaultIsolationMode,
        }),
    ))

    app.post('/team-projects/:projectId/roles', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        createRoleBodySchema,
        async (engine, body) => ({
            ok: true,
            role: await engine.createTeamRole({
                ...body,
                projectId: c.req.param('projectId'),
            }),
        }),
    ))

    app.patch('/team-projects/:projectId/roles/:roleId', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        updateRoleBodySchema,
        async (engine, body) => ({
            ok: true,
            role: await engine.updateTeamRole({
                ...body,
                projectId: c.req.param('projectId'),
                roleId: c.req.param('roleId'),
            }),
        }),
    ))

    app.delete('/team-projects/:projectId/roles/:roleId', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        deleteRoleBodySchema,
        async (engine, body) => ({
            ok: true,
            roleId: await engine.deleteTeamRole({
                ...body,
                projectId: c.req.param('projectId'),
                roleId: c.req.param('roleId'),
            }),
        }),
    ))

    app.post('/team-projects/:projectId/close', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        closeProjectBodySchema,
        async (engine, body) => ({
            ok: true,
            project: (await engine.closeTeamProject({
                managerSessionId: body.managerSessionId,
                projectId: c.req.param('projectId'),
                summary: body.summary,
            })).project,
        }),
    ))
}

export function registerTeamMemberRoutes(app: TeamRouteApp, getSyncEngine: GetSyncEngine): void {
    app.post('/team-members', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        spawnMemberBodySchema,
        async (engine, body) => {
            const result = await engine.spawnTeamMember(body)
            return {
                ok: true,
                member: result.member,
                session: result.session,
                launch: result.launch,
            }
        },
    ))

    app.patch('/team-members/:memberId', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        updateMemberBodySchema,
        async (engine, body) => ({
            ok: true,
            ...(await engine.updateTeamMember({
                ...body,
                memberId: c.req.param('memberId'),
            })),
        }),
    ))

    app.post('/team-members/:memberId/message', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        messageMemberBodySchema,
        async (engine, body) => {
            const result = await engine.messageTeamMember({
                managerSessionId: body.managerSessionId,
                memberId: c.req.param('memberId'),
                text: body.text,
                kind: body.kind,
            })
            return {
                ok: true,
                member: result.member,
                session: result.session,
            }
        },
    ))

    app.post('/team-members/:memberId/interject', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        interjectBodySchema,
        async (engine, body) => ({
            ok: true,
            session: await engine.interjectTeamMember(c.req.param('memberId'), body),
        }),
    ))

    app.post('/team-members/:memberId/takeover', async (c) => await executeTeamAction(
        c,
        getSyncEngine,
        async (engine) => ({
            ok: true,
            session: await engine.takeOverTeamMember(c.req.param('memberId')),
        }),
    ))

    app.post('/team-members/:memberId/return', async (c) => await executeTeamAction(
        c,
        getSyncEngine,
        async (engine) => ({
            ok: true,
            session: await engine.returnTeamMember(c.req.param('memberId')),
        }),
    ))
}

export function registerTeamTaskRoutes(app: TeamRouteApp, getSyncEngine: GetSyncEngine): void {
    app.post('/team-tasks', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        createTaskBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.createTeamTask(body),
        }),
    ))

    app.patch('/team-tasks/:taskId', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        updateTaskBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.updateTeamTask({
                ...body,
                taskId: c.req.param('taskId'),
            }),
        }),
    ))

    app.post('/team-tasks/:taskId/review-request', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        reviewRequestBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.requestTaskReview({
                managerSessionId: body.managerSessionId,
                taskId: c.req.param('taskId'),
                reviewerMemberId: body.reviewerMemberId,
                note: body.note,
            }),
        }),
    ))

    app.post('/team-tasks/:taskId/review-result', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        reviewResultBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.submitTaskReviewResult({
                memberId: body.memberId,
                taskId: c.req.param('taskId'),
                decision: body.decision,
                summary: body.summary,
            }),
        }),
    ))

    app.post('/team-tasks/:taskId/verification-request', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        verificationRequestBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.requestTaskVerification({
                managerSessionId: body.managerSessionId,
                taskId: c.req.param('taskId'),
                verifierMemberId: body.verifierMemberId,
                note: body.note,
            }),
        }),
    ))

    app.post('/team-tasks/:taskId/verification-result', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        verificationResultBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.submitTaskVerificationResult({
                memberId: body.memberId,
                taskId: c.req.param('taskId'),
                decision: body.decision,
                summary: body.summary,
            }),
        }),
    ))

    app.post('/team-tasks/:taskId/accept', async (c) => await executeTeamActionWithBody(
        c,
        getSyncEngine,
        acceptTaskBodySchema,
        async (engine, body) => ({
            ok: true,
            task: await engine.acceptTeamTask({
                managerSessionId: body.managerSessionId,
                taskId: c.req.param('taskId'),
                summary: body.summary,
                skipVerificationReason: body.skipVerificationReason,
            }),
        }),
    ))
}
