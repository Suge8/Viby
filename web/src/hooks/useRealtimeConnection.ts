import { useEffect, useMemo, useRef } from 'react'
import { type WebSubscription, type WebVisibilityState } from '@viby/protocol'
import { useQueryClient } from '@tanstack/react-query'
import type { SyncEvent } from '@/types/api'
import { createRealtimeEventController, type ToastEvent } from '@/lib/realtimeEventController'
import { createLazyRealtimeSocketOptions } from '@/lib/socketOptions'
import type { Socket } from 'socket.io-client'

const EMPTY_SUBSCRIPTION: WebSubscription = {}

type RealtimeCallbacks = {
    onEvent: (event: SyncEvent) => void
    onConnect?: (details: { initial: boolean; recovered: boolean; transport: string | null }) => void
    onDisconnect?: (reason: string) => void
    onError?: (error: unknown) => void
    onToast?: (event: ToastEvent) => void
}

function getVisibilityState(): WebVisibilityState {
    if (typeof document === 'undefined') {
        return 'hidden'
    }
    return document.visibilityState === 'visible' ? 'visible' : 'hidden'
}

function normalizeDisconnectReason(reason: string): string {
    if (reason === 'ping timeout') {
        return 'heartbeat-timeout'
    }
    if (reason === 'transport close' || reason === 'io server disconnect') {
        return 'closed'
    }
    return 'error'
}

function applySubscription(socket: Socket, subscription: WebSubscription): void {
    socket.emit('web:subscribe', subscription)
}

function applyVisibility(socket: Socket): void {
    socket.emit('web:visibility', getVisibilityState())
}

function refreshSocketVisibility(socket: Socket): void {
    if (socket.connected) {
        applyVisibility(socket)
        return
    }

    if (getVisibilityState() === 'visible') {
        socket.connect()
    }
}

export function useRealtimeConnection(options: {
    enabled: boolean
    token: string
    baseUrl: string
    subscription?: WebSubscription
    pushEndpoint?: string | null
    onEvent: (event: SyncEvent) => void
    onConnect?: (details: { initial: boolean; recovered: boolean; transport: string | null }) => void
    onDisconnect?: (reason: string) => void
    onError?: (error: unknown) => void
    onToast?: (event: ToastEvent) => void
}): void {
    const queryClient = useQueryClient()
    const callbacksRef = useRef<RealtimeCallbacks>({
        onEvent: options.onEvent,
        onConnect: options.onConnect,
        onDisconnect: options.onDisconnect,
        onError: options.onError,
        onToast: options.onToast
    })
    const socketRef = useRef<Socket | null>(null)
    const tokenRef = useRef(options.token)
    const subscription = options.subscription ?? EMPTY_SUBSCRIPTION
    const subscriptionRef = useRef<WebSubscription>({
        ...subscription,
        ...(options.pushEndpoint ? { pushEndpoint: options.pushEndpoint } : {})
    })
    const hasConnectedRef = useRef(false)

    useEffect(() => {
        callbacksRef.current = {
            onEvent: options.onEvent,
            onConnect: options.onConnect,
            onDisconnect: options.onDisconnect,
            onError: options.onError,
            onToast: options.onToast
        }
    }, [options.onConnect, options.onDisconnect, options.onError, options.onEvent, options.onToast])

    useEffect(() => {
        tokenRef.current = options.token
        const socket = socketRef.current
        if (!socket) {
            return
        }
        socket.auth = { token: options.token }
    }, [options.token])

    useEffect(() => {
        subscriptionRef.current = {
            ...subscription,
            ...(options.pushEndpoint ? { pushEndpoint: options.pushEndpoint } : {})
        }
    }, [options.pushEndpoint, subscription])

    const subscriptionKey = useMemo(() => {
        return `${subscription.all ? '1' : '0'}|${subscription.sessionId ?? ''}|${subscription.machineId ?? ''}|${options.pushEndpoint ?? ''}`
    }, [options.pushEndpoint, subscription.all, subscription.machineId, subscription.sessionId])

    useEffect(() => {
        if (!options.enabled) {
            socketRef.current = null
            hasConnectedRef.current = false
            return
        }

        const eventController = createRealtimeEventController({
            queryClient,
            onEvent: (event) => callbacksRef.current.onEvent(event),
            onToast: (event) => callbacksRef.current.onToast?.(event)
        })
        let isDisposed = false
        let cleanupSocket: Socket | null = null

        function handleVisibilityChange(): void {
            const socket = socketRef.current
            if (!socket) {
                return
            }
            refreshSocketVisibility(socket)
        }

        function handlePageShow(): void {
            const socket = socketRef.current
            if (!socket) {
                return
            }
            refreshSocketVisibility(socket)
        }

        function handlePageHide(): void {
            const socket = socketRef.current
            if (!socket) {
                return
            }
            if (!socket.connected) {
                return
            }
            applyVisibility(socket)
        }

        function handleOnline(): void {
            const socket = socketRef.current
            if (!socket) {
                return
            }
            refreshSocketVisibility(socket)
        }

        void import('socket.io-client').then(({ io }) => {
            if (isDisposed) {
                return
            }

            const socket = io(`${options.baseUrl}/web`, {
                auth: { token: tokenRef.current },
                ...createLazyRealtimeSocketOptions()
            })
            cleanupSocket = socket
            socketRef.current = socket

            socket.on('sync:event', (event: SyncEvent) => {
                eventController.handleEvent(event)
            })
            socket.on('connect', () => {
                const initial = !hasConnectedRef.current
                hasConnectedRef.current = true
                applySubscription(socket, subscriptionRef.current)
                applyVisibility(socket)
                callbacksRef.current.onConnect?.({
                    initial,
                    recovered: socket.recovered,
                    transport: socket.io.engine.transport.name ?? null
                })
            })
            socket.on('disconnect', (reason) => {
                if (reason === 'io client disconnect') {
                    return
                }
                callbacksRef.current.onDisconnect?.(normalizeDisconnectReason(reason))
            })
            socket.on('connect_error', (error) => {
                callbacksRef.current.onError?.(error)
            })

            socket.connect()
        }).catch((error) => {
            if (isDisposed) {
                return
            }
            callbacksRef.current.onError?.(error)
        })

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('pageshow', handlePageShow)
        window.addEventListener('pagehide', handlePageHide)
        window.addEventListener('online', handleOnline)

        return () => {
            isDisposed = true
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('pageshow', handlePageShow)
            window.removeEventListener('pagehide', handlePageHide)
            window.removeEventListener('online', handleOnline)
            eventController.dispose()
            cleanupSocket?.disconnect()
            if (socketRef.current === cleanupSocket) {
                socketRef.current = null
            }
        }
    }, [options.baseUrl, options.enabled, queryClient])

    useEffect(() => {
        if (!options.enabled) {
            return
        }
        const socket = socketRef.current
        if (!socket || !socket.connected) {
            return
        }
        applySubscription(socket, {
            ...subscription,
            ...(options.pushEndpoint ? { pushEndpoint: options.pushEndpoint } : {})
        })
    }, [options.enabled, options.pushEndpoint, subscription, subscriptionKey])
}
