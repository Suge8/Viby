import type { Session } from '../sync/syncEngine'
import type { NotificationChannel } from '../notifications/notificationTypes'
import { getAgentName, getSessionName } from '../notifications/sessionInfo'
import type { PushPayload, PushService } from './pushService'
import type { WebRealtimeManager } from '../socket/webRealtimeManager'

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly webRealtimeManager: WebRealtimeManager,
        _appUrl: string
    ) {}

    async sendPermissionRequest(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const name = getSessionName(session)
        const request = session.agentState?.requests
            ? Object.values(session.agentState.requests)[0]
            : null
        const toolName = request?.tool ? ` (${request.tool})` : ''

        const payload: PushPayload = {
            title: 'Permission Request',
            body: `${name}${toolName}`,
            tag: `permission-${session.id}`,
            data: {
                type: 'permission-request',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        const url = payload.data?.url ?? this.buildSessionPath(session.id)
        const suppressedPushEndpoints = await this.webRealtimeManager.sendToast({
            type: 'toast',
            data: {
                title: payload.title,
                body: payload.body,
                sessionId: session.id,
                url,
                tone: 'warning',
                kind: 'permission-request',
                sessionName: name,
                toolName: request?.tool ?? undefined
            }
        })

        await this.pushService.send(payload, {
            excludeEndpoints: suppressedPushEndpoints
        })
    }

    async sendReady(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)

        const payload: PushPayload = {
            title: 'Ready for input',
            body: `${agentName} is waiting in ${name}`,
            tag: `ready-${session.id}`,
            data: {
                type: 'ready',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        const url = payload.data?.url ?? this.buildSessionPath(session.id)
        const suppressedPushEndpoints = await this.webRealtimeManager.sendToast({
            type: 'toast',
            data: {
                title: payload.title,
                body: payload.body,
                sessionId: session.id,
                url,
                tone: 'success',
                kind: 'ready',
                sessionName: name,
                agentName
            }
        })

        await this.pushService.send(payload, {
            excludeEndpoints: suppressedPushEndpoints
        })
    }

    private buildSessionPath(sessionId: string): string {
        return `/sessions/${sessionId}`
    }
}
