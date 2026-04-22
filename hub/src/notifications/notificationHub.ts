import { getPendingRequestsCount, getSessionActivityKind, isSessionReadyForInput } from '@viby/protocol'
import type { SessionActivityKind } from '@viby/protocol/types'
import { reportHubRuntimeError } from '../runtime/runtimeDiagnostics'
import type { Session, SyncEngine, SyncEvent } from '../sync/syncEngine'
import type { NotificationChannel, NotificationHubOptions } from './notificationTypes'

const DEFAULT_READY_COOLDOWN_MS = 5_000
const DEFAULT_PERMISSION_DEBOUNCE_MS = 500

type ReadyStateSnapshot = {
    active: boolean
    thinking: boolean
    pendingRequestsCount: number
    latestActivityKind: SessionActivityKind | null
}

export class NotificationHub {
    private readonly channels: NotificationChannel[]
    private readonly readyCooldownMs: number
    private readonly permissionDebounceMs: number
    private readonly lastKnownRequests: Map<string, Set<string>> = new Map()
    private readonly notificationDebounce: Map<string, NodeJS.Timeout> = new Map()
    private readonly lastReadyNotificationAt: Map<string, number> = new Map()
    private readonly lastReadyState: Map<string, boolean> = new Map()
    private readonly lastKnownActivityKinds: Map<string, SessionActivityKind | null> = new Map()
    private unsubscribeSyncEvents: (() => void) | null = null

    constructor(
        private readonly syncEngine: SyncEngine,
        channels: NotificationChannel[],
        options?: NotificationHubOptions
    ) {
        this.channels = channels
        this.readyCooldownMs = options?.readyCooldownMs ?? DEFAULT_READY_COOLDOWN_MS
        this.permissionDebounceMs = options?.permissionDebounceMs ?? DEFAULT_PERMISSION_DEBOUNCE_MS
        this.unsubscribeSyncEvents = this.syncEngine.subscribe((event) => {
            this.handleSyncEvent(event)
        })
    }

    stop(): void {
        if (this.unsubscribeSyncEvents) {
            this.unsubscribeSyncEvents()
            this.unsubscribeSyncEvents = null
        }

        for (const timer of this.notificationDebounce.values()) {
            clearTimeout(timer)
        }
        this.notificationDebounce.clear()
        this.lastKnownRequests.clear()
        this.lastReadyNotificationAt.clear()
        this.lastReadyState.clear()
        this.lastKnownActivityKinds.clear()
    }

    private handleSyncEvent(event: SyncEvent): void {
        if ((event.type === 'session-updated' || event.type === 'session-added') && event.sessionId) {
            const session = this.syncEngine.getSession(event.sessionId)
            if (!session || !session.active) {
                this.clearSessionState(event.sessionId)
                return
            }
            this.checkForPermissionNotification(session)
            this.syncReadyNotification(session.id)
            return
        }

        if (event.type === 'session-removed' && event.sessionId) {
            this.clearSessionState(event.sessionId)
            return
        }

        if (event.type === 'message-received' && event.sessionId) {
            this.lastKnownActivityKinds.set(event.sessionId, getSessionActivityKind(event.message.content))
            this.syncReadyNotification(event.sessionId)
        }
    }

    private clearSessionState(sessionId: string): void {
        const existingTimer = this.notificationDebounce.get(sessionId)
        if (existingTimer) {
            clearTimeout(existingTimer)
            this.notificationDebounce.delete(sessionId)
        }
        this.lastKnownRequests.delete(sessionId)
        this.lastReadyNotificationAt.delete(sessionId)
        this.lastReadyState.delete(sessionId)
        this.lastKnownActivityKinds.delete(sessionId)
    }

    private getNotifiableSession(sessionId: string): Session | null {
        const session = this.syncEngine.getSession(sessionId)
        if (!session || !session.active) {
            return null
        }
        return session
    }

    private checkForPermissionNotification(session: Session): void {
        const requests = session.agentState?.requests
        if (!requests) {
            return
        }

        const newRequestIds = new Set(Object.keys(requests))
        const oldRequestIds = this.lastKnownRequests.get(session.id) || new Set()

        let hasNewRequests = false
        for (const requestId of newRequestIds) {
            if (!oldRequestIds.has(requestId)) {
                hasNewRequests = true
                break
            }
        }

        this.lastKnownRequests.set(session.id, newRequestIds)

        if (!hasNewRequests) {
            return
        }

        const existingTimer = this.notificationDebounce.get(session.id)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        const timer = setTimeout(() => {
            this.notificationDebounce.delete(session.id)
            this.sendPermissionNotification(session.id).catch((error) => {
                reportHubRuntimeError('Failed to send permission notification.', error)
            })
        }, this.permissionDebounceMs)

        this.notificationDebounce.set(session.id, timer)
    }

    private async sendPermissionNotification(sessionId: string): Promise<void> {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            return
        }

        await this.notifyPermission(session)
    }

    private syncReadyNotification(sessionId: string): void {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            this.clearSessionState(sessionId)
            return
        }

        const nextReadyState = isSessionReadyForInput(this.getReadyStateOptions(sessionId, session))
        const previousReadyState = this.lastReadyState.get(sessionId) ?? false
        this.lastReadyState.set(sessionId, nextReadyState)

        if (!nextReadyState || previousReadyState) {
            return
        }

        this.sendReadyNotification(sessionId).catch((error) => {
            reportHubRuntimeError('Failed to send ready notification.', error)
        })
    }

    private getReadyStateOptions(sessionId: string, session: Session): ReadyStateSnapshot {
        return {
            active: session.active,
            thinking: session.thinking,
            pendingRequestsCount: getPendingRequestsCount(session.agentState),
            latestActivityKind: this.lastKnownActivityKinds.get(sessionId) ?? null,
        }
    }

    private async sendReadyNotification(sessionId: string): Promise<void> {
        const session = this.getNotifiableSession(sessionId)
        if (!session) {
            return
        }

        const now = Date.now()
        const last = this.lastReadyNotificationAt.get(sessionId) ?? 0
        if (now - last < this.readyCooldownMs) {
            return
        }
        this.lastReadyNotificationAt.set(sessionId, now)

        await this.notifyReady(session)
    }

    private async notifyReady(session: Session): Promise<void> {
        for (const channel of this.channels) {
            try {
                await channel.sendReady(session)
            } catch (error) {
                reportHubRuntimeError('Failed to send ready notification.', error)
            }
        }
    }

    private async notifyPermission(session: Session): Promise<void> {
        for (const channel of this.channels) {
            try {
                await channel.sendPermissionRequest(session)
            } catch (error) {
                reportHubRuntimeError('Failed to send permission notification.', error)
            }
        }
    }
}
