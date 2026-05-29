import {
    presentSessionAttentionNotification,
    type SessionAttentionNotificationKind,
    type SessionAttentionNotificationPresentation,
} from '@viby/protocol'
import type { NotificationChannel } from '../notifications/notificationTypes'
import { getSessionName } from '../notifications/sessionInfo'
import type { WebRealtimeManager } from '../socket/webRealtimeManager'
import type { Session } from '../sync/syncEngine'
import type { PushPayload, PushService } from './pushService'

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly webRealtimeManager: WebRealtimeManager
    ) {}

    async sendPermissionRequest(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const sessionTitle = getSessionName(session)
        const request = session.agentState?.requests ? Object.values(session.agentState.requests)[0] : null
        const presentation = presentSessionAttentionNotification({
            kind: 'permission-request',
            sessionId: session.id,
            sessionTitle,
            toolName: request?.tool ?? null,
        })
        await this.sendNotification(
            session,
            sessionTitle,
            'permission-request',
            presentation,
            request?.tool ?? undefined
        )
    }

    async sendReady(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const sessionTitle = getSessionName(session)
        const presentation = presentSessionAttentionNotification({
            kind: 'ready',
            sessionId: session.id,
            sessionTitle,
        })
        await this.sendNotification(session, sessionTitle, 'ready', presentation)
    }

    private async sendNotification(
        session: Session,
        sessionTitle: string,
        kind: SessionAttentionNotificationKind,
        presentation: SessionAttentionNotificationPresentation,
        toolName?: string
    ): Promise<void> {
        const payload: PushPayload = {
            title: presentation.push.title,
            body: presentation.push.body,
            tag: presentation.push.tag,
            data: presentation.push.data,
        }
        const url = payload.data?.url ?? this.buildSessionPath(session.id)
        const suppressedPushEndpoints = await this.webRealtimeManager.sendToast({
            type: 'toast',
            data: {
                title: presentation.toast.title,
                body: presentation.toast.description,
                sessionId: session.id,
                url,
                tone: presentation.toast.tone,
                kind,
                sessionName: sessionTitle,
                toolName,
            },
        })

        await this.pushService.send(payload, {
            excludeEndpoints: suppressedPushEndpoints,
        })
    }

    private buildSessionPath(sessionId: string): string {
        return `/sessions/${sessionId}`
    }
}
