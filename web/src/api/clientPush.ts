import type {
    PushSubscriptionPayload,
    PushUnsubscribePayload,
    PushVapidPublicKeyResponse,
} from '@/types/api'
import type { ApiClientRequest } from './client'

export async function getPushVapidPublicKey(
    request: ApiClientRequest
): Promise<PushVapidPublicKeyResponse> {
    return await request<PushVapidPublicKeyResponse>('/api/push/vapid-public-key')
}

export async function subscribePushNotifications(
    request: ApiClientRequest,
    payload: PushSubscriptionPayload
): Promise<void> {
    await request('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(payload)
    })
}

export async function unsubscribePushNotifications(
    request: ApiClientRequest,
    payload: PushUnsubscribePayload
): Promise<void> {
    await request('/api/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify(payload)
    })
}
