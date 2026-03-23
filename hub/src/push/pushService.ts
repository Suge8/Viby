import * as webPush from 'web-push'
import type { Store } from '../store'
import type { VapidKeys } from '../config/vapidKeys'

export type PushPayload = {
    title: string
    body: string
    tag?: string
    data?: {
        type: string
        sessionId: string
        url: string
    }
}

type StoredSubscription = {
    endpoint: string
    p256dh: string
    auth: string
}

type PushSubscription = {
    endpoint: string
    keys: {
        p256dh: string
        auth: string
    }
}

type PushSendError = {
    statusCode?: unknown
    body?: unknown
}

type PushSender = (subscription: PushSubscription, body: string) => Promise<unknown>

function getPushErrorStatusCode(error: unknown): number | null {
    return typeof (error as PushSendError).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : null
}

function hasErrorReason(body: unknown, reason: string): boolean {
    if (typeof body !== 'string') {
        return false
    }

    try {
        const parsed = JSON.parse(body) as { reason?: unknown }
        return parsed.reason === reason
    } catch {
        return false
    }
}

export function isStalePushSubscriptionError(error: unknown): boolean {
    const statusCode = getPushErrorStatusCode(error)
    if (statusCode === 404 || statusCode === 410) {
        return true
    }

    return statusCode === 400 && hasErrorReason((error as PushSendError).body, 'VapidPkHashMismatch')
}

export class PushService {
    constructor(
        private readonly vapidKeys: VapidKeys,
        private readonly subject: string,
        private readonly store: Store,
        private readonly sendNotification: PushSender = webPush.sendNotification
    ) {
        webPush.setVapidDetails(this.subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey)
    }

    async send(payload: PushPayload, options?: { excludeEndpoints?: readonly string[] }): Promise<void> {
        const excludedEndpoints = new Set(options?.excludeEndpoints ?? [])
        const subscriptions = this.store.push.getPushSubscriptions().filter((subscription) => {
            return !excludedEndpoints.has(subscription.endpoint)
        })
        if (subscriptions.length === 0) {
            return
        }

        const body = JSON.stringify(payload)
        await Promise.all(subscriptions.map((subscription) => {
            return this.sendToSubscription(subscription, body)
        }))
    }

    private async sendToSubscription(
        subscription: StoredSubscription,
        body: string
    ): Promise<void> {
        const pushSubscription: PushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
            }
        }

        try {
            await this.sendNotification(pushSubscription, body)
        } catch (error) {
            if (isStalePushSubscriptionError(error)) {
                this.store.push.removePushSubscription(subscription.endpoint)
                return
            }

            console.error('[PushService] Failed to send notification:', error)
        }
    }
}
