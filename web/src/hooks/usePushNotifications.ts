import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { shouldRegisterServiceWorkerForOrigin } from '@/lib/runtimeAssetRecovery'

export type PushNotificationsError =
    | 'permission-blocked'
    | 'service-worker-missing'
    | 'subscribe-failed'
    | 'unsubscribe-failed'
    | null

const PUSH_VISIBILITY_STATE = 'visible'

function isPushSupported(): boolean {
    return typeof window !== 'undefined'
        && shouldRegisterServiceWorkerForOrigin(window.location.origin)
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
    const base64 = (base64Url + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const raw = atob(base64)
    const output = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i)
    }
    return output
}

function normalizeApplicationServerKey(value: BufferSource | null): Uint8Array | null {
    if (!value) {
        return null
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value)
    }

    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

function hasMatchingApplicationServerKey(subscription: PushSubscription, expectedKey: Uint8Array): boolean {
    const currentKey = normalizeApplicationServerKey(subscription.options.applicationServerKey)
    if (!currentKey || currentKey.length !== expectedKey.length) {
        return false
    }

    for (let index = 0; index < currentKey.length; index += 1) {
        if (currentKey[index] !== expectedKey[index]) {
            return false
        }
    }

    return true
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!isPushSupported()) {
        return null
    }

    return await navigator.serviceWorker.getRegistration() ?? null
}

export function usePushNotifications(api: ApiClient | null) {
    const [isSupported, setIsSupported] = useState(false)
    const [permission, setPermission] = useState<NotificationPermission>('default')
    const [isSubscribed, setIsSubscribed] = useState(false)
    const [pushEndpoint, setPushEndpoint] = useState<string | null>(null)
    const [isPending, setIsPending] = useState(false)
    const [lastError, setLastError] = useState<PushNotificationsError>(null)

    const refreshSubscription = useCallback(async () => {
        if (!isPushSupported()) {
            setIsSupported(false)
            setIsSubscribed(false)
            setPushEndpoint(null)
            return
        }

        setIsSupported(true)
        setPermission(Notification.permission)

        if (Notification.permission !== 'granted') {
            setIsSubscribed(false)
            setPushEndpoint(null)
            return
        }

        const registration = await getPushRegistration()
        if (!registration) {
            setIsSubscribed(false)
            setPushEndpoint(null)
            return
        }

        const subscription = await registration.pushManager.getSubscription()
        setIsSubscribed(Boolean(subscription))
        setPushEndpoint(subscription?.endpoint ?? null)
    }, [])

    useEffect(() => {
        void refreshSubscription()

        if (typeof window === 'undefined') {
            return
        }

        function handlePageShow(): void {
            void refreshSubscription()
        }

        function handleVisibilityChange(): void {
            if (document.visibilityState === PUSH_VISIBILITY_STATE) {
                void refreshSubscription()
            }
        }

        window.addEventListener('pageshow', handlePageShow)
        window.addEventListener('focus', handlePageShow)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('pageshow', handlePageShow)
            window.removeEventListener('focus', handlePageShow)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [refreshSubscription])

    const subscribeWithCurrentPermission = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported()) {
            return false
        }

        if (Notification.permission !== 'granted') {
            setPermission(Notification.permission)
            return false
        }

        try {
            const registration = await getPushRegistration()
            if (!registration) {
                setLastError('service-worker-missing')
                setIsSubscribed(false)
                setPushEndpoint(null)
                return false
            }

            const existing = await registration.pushManager.getSubscription()
            const { publicKey } = await api.getPushVapidPublicKey()
            const applicationServerKey = base64UrlToUint8Array(publicKey)
            let subscription = existing

            if (subscription && !hasMatchingApplicationServerKey(subscription, applicationServerKey)) {
                const staleEndpoint = subscription.endpoint
                await subscription.unsubscribe()
                await api.unsubscribePushNotifications({ endpoint: staleEndpoint })
                subscription = null
            }

            if (!subscription) {
                const subscribeKey = Uint8Array.from(applicationServerKey).buffer
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: subscribeKey
                })
            }

            const json = subscription.toJSON()
            const keys = json.keys
            if (!json.endpoint || !keys?.p256dh || !keys.auth) {
                setPushEndpoint(null)
                return false
            }

            await api.subscribePushNotifications({
                endpoint: json.endpoint,
                keys: {
                    p256dh: keys.p256dh,
                    auth: keys.auth
                }
            })
            setLastError(null)
            setIsSubscribed(true)
            setPushEndpoint(json.endpoint)
            return true
        } catch (error) {
            console.error('[PushNotifications] Failed to subscribe:', error)
            setLastError('subscribe-failed')
            setPushEndpoint(null)
            return false
        }
    }, [api])

    const enableNotifications = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported()) {
            return false
        }

        setIsPending(true)
        setLastError(null)

        try {
            const result = Notification.permission === 'granted'
                ? 'granted'
                : await Notification.requestPermission()
            setPermission(result)

            if (result !== 'granted') {
                setIsSubscribed(false)
                setPushEndpoint(null)
                if (result === 'denied') {
                    setLastError('permission-blocked')
                }
                return false
            }

            return await subscribeWithCurrentPermission()
        } finally {
            setIsPending(false)
        }
    }, [api, subscribeWithCurrentPermission])

    const ensureSubscription = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported() || Notification.permission !== 'granted') {
            return false
        }

        return await subscribeWithCurrentPermission()
    }, [api, subscribeWithCurrentPermission])

    const disableNotifications = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported()) {
            return false
        }

        setIsPending(true)
        setLastError(null)

        try {
            const registration = await getPushRegistration()
            if (!registration) {
                setIsSubscribed(false)
                setPushEndpoint(null)
                return true
            }

            const subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                setIsSubscribed(false)
                setPushEndpoint(null)
                return true
            }

            const endpoint = subscription.endpoint
            const success = await subscription.unsubscribe()
            await api.unsubscribePushNotifications({ endpoint })
            setLastError(null)
            setIsSubscribed(false)
            setPushEndpoint(null)
            return success
        } catch (error) {
            console.error('[PushNotifications] Failed to unsubscribe:', error)
            setLastError('unsubscribe-failed')
            return false
        } finally {
            setIsPending(false)
        }
    }, [api])

    return {
        isSupported,
        permission,
        isSubscribed,
        pushEndpoint,
        isPending,
        lastError,
        refreshSubscription,
        enableNotifications,
        ensureSubscription,
        disableNotifications
    }
}
