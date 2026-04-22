import { PairingCreateRequestSchema } from '@viby/protocol/pairing'
import { Hono } from 'hono'
import type { PairingBrokerClient } from '../../pairing/client'
import { createPairingBrokerClient } from '../../pairing/client'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { createJsonBodyValidator } from './sessionRouteSupport'

const PAIRING_EVENT_HEARTBEAT_MS = 15_000

export function createPairingRoutes(
    client: PairingBrokerClient = createPairingBrokerClient(),
    getSyncEngine: () => SyncEngine | null = () => null
): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/pairing/events', (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json(
                {
                    error: 'Pairing event stream is unavailable on this hub.',
                    code: 'pairing_event_stream_unavailable',
                },
                503
            )
        }

        const encoder = new TextEncoder()

        return new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    let closed = false
                    let heartbeatId: ReturnType<typeof setInterval> | null = null
                    let abortHandler: (() => void) | null = null
                    let unsubscribe = () => {}

                    const writeLine = (payload: unknown): void => {
                        if (closed) {
                            return
                        }

                        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
                    }

                    const close = (): void => {
                        if (closed) {
                            return
                        }

                        closed = true
                        unsubscribe()
                        if (heartbeatId) {
                            clearInterval(heartbeatId)
                        }
                        if (abortHandler) {
                            c.req.raw.signal.removeEventListener('abort', abortHandler)
                        }
                        controller.close()
                    }

                    unsubscribe = engine.subscribe((event) => {
                        writeLine({ type: 'event', event })
                    })

                    heartbeatId = setInterval(() => {
                        writeLine({ type: 'heartbeat', at: Date.now() })
                    }, PAIRING_EVENT_HEARTBEAT_MS)

                    abortHandler = close
                    c.req.raw.signal.addEventListener('abort', abortHandler, { once: true })
                },
            }),
            {
                headers: {
                    'content-type': 'application/x-ndjson; charset=utf-8',
                    'cache-control': 'no-cache, no-store, must-revalidate',
                    connection: 'keep-alive',
                },
            }
        )
    })

    app.post(
        '/pairings',
        createJsonBodyValidator(PairingCreateRequestSchema, 'Invalid pairing create body'),
        async (c) => {
            if (!client.isConfigured()) {
                return c.json(
                    {
                        error: 'Pairing broker is not configured on this hub.',
                        code: 'pairing_unavailable',
                    },
                    503
                )
            }

            try {
                return c.json(await client.createPairing(c.req.valid('json')))
            } catch (error) {
                return c.json(
                    {
                        error: error instanceof Error ? error.message : 'Pairing broker request failed',
                        code: 'pairing_broker_error',
                    },
                    502
                )
            }
        }
    )

    return app
}
