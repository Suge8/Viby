import { Hono } from 'hono'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import {
    registerTeamMemberRoutes,
    registerTeamProjectRoutes,
    registerTeamTaskRoutes,
} from './teamRouteRegistrars'

export function createTeamsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    registerTeamProjectRoutes(app, getSyncEngine)
    registerTeamMemberRoutes(app, getSyncEngine)
    registerTeamTaskRoutes(app, getSyncEngine)

    return app
}
