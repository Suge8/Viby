import { WebSubscriptionSchema, WebVisibilityStateSchema } from '@viby/protocol'
import type { SocketWithData } from '../socketTypes'
import type { WebRealtimeManager } from '../webRealtimeManager'

export type WebHandlersDeps = {
    realtimeManager: WebRealtimeManager
}

export function registerWebHandlers(socket: SocketWithData, deps: WebHandlersDeps): void {
    socket.on('web:subscribe', (payload: unknown) => {
        const parsed = WebSubscriptionSchema.safeParse(payload)
        if (!parsed.success) {
            return
        }
        deps.realtimeManager.subscribe(socket, parsed.data)
    })

    socket.on('web:visibility', (payload: unknown) => {
        const parsed = WebVisibilityStateSchema.safeParse(payload)
        if (!parsed.success) {
            return
        }
        deps.realtimeManager.setVisibility(socket, parsed.data)
    })

    socket.on('disconnect', () => {
        deps.realtimeManager.clearSocket(socket.id)
    })
}
