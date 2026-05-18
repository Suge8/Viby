import type { Hono } from 'hono'
import { hashPairingSecret } from './crypto'
import type { PairingHttpOptions } from './httpTypes'
import type { PairingSocketHub } from './ws'
import type { PairingSocketLike } from './wsTypes'

type SocketRoute = {
    hub: PairingSocketHub
    path: string
}

function toPairingSocket(socket: unknown): PairingSocketLike {
    if (socket && typeof socket === 'object' && 'raw' in socket && socket.raw) {
        return socket.raw as PairingSocketLike
    }

    return socket as PairingSocketLike
}

export function registerPairingSocketRoutes(app: Hono, options: PairingHttpOptions): void {
    registerSocketRoute(app, options, { path: '/pairings/:id/ws', hub: options.socketHub })
    registerSocketRoute(app, options, { path: '/pairings/:id/tunnel', hub: options.tunnelHub })
}

function registerSocketRoute(app: Hono, options: PairingHttpOptions, route: SocketRoute): void {
    app.get(
        route.path,
        options.upgradeWebSocket((c) => {
            const pairingId = c.req.param('id')
            const token = c.req.query('token')
            const tokenHash = token ? hashPairingSecret(token) : null
            return {
                async onOpen(_event, ws) {
                    if (!tokenHash) {
                        ws.close(1008, 'missing-token')
                        return
                    }

                    await route.hub.attach(pairingId, tokenHash, toPairingSocket(ws))
                },
                async onMessage(event, ws) {
                    await route.hub.handleMessage(toPairingSocket(ws), event.data)
                },
                async onClose(_event, ws) {
                    await route.hub.detach(toPairingSocket(ws))
                },
                onError(error) {
                    options.logger?.error?.('[Pairing] WebSocket error:', error)
                },
            }
        })
    )
}
