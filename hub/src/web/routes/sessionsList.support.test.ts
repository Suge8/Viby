import type { SessionMessageActivity } from '@viby/protocol/types'
import { Hono } from 'hono'
import type { Session, SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createSessionsRoutes } from './sessions'

export function createSessionsListApp(options: {
    sessions: Session[]
    messageActivities?: Record<string, SessionMessageActivity>
}) {
    const sessions = options.sessions.map((session) => {
        const activity = options.messageActivities?.[session.id]
        if (!activity) {
            return session
        }

        return {
            ...session,
            latestActivityAt: activity.latestActivityAt,
            latestActivityKind: activity.latestActivityKind,
            latestCompletedReplyAt: activity.latestCompletedReplyAt,
        }
    })

    const engine = {
        getSessions: () => sessions,
        getSessionsRevision: () => 1,
    } as Partial<SyncEngine>

    const app = new Hono<WebAppEnv>()
    app.route(
        '/api',
        createSessionsRoutes(() => engine as SyncEngine)
    )
    return app
}
