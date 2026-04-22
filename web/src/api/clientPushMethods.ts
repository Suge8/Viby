import type { PushSubscriptionPayload, PushUnsubscribePayload, PushVapidPublicKeyResponse } from '@/types/api'
import type { ApiClientRequest } from './client'
import { getPushVapidPublicKey, subscribePushNotifications, unsubscribePushNotifications } from './clientPush'

export function createApiClientPushMethods(request: ApiClientRequest) {
    return {
        async getPushVapidPublicKey(): Promise<PushVapidPublicKeyResponse> {
            return await getPushVapidPublicKey(request)
        },
        async subscribePushNotifications(payload: PushSubscriptionPayload): Promise<void> {
            await subscribePushNotifications(request, payload)
        },
        async unsubscribePushNotifications(payload: PushUnsubscribePayload): Promise<void> {
            await unsubscribePushNotifications(request, payload)
        },
    }
}
