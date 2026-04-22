import { PairingClaimRequestSchema, PairingCreateRequestSchema } from '@viby/protocol/pairing'
import { Hono } from 'hono'
import { registerPairingReconnectRoutes } from './httpReconnectRoutes'
import { registerPairingSessionRoutes } from './httpSessionRoutes'
import { authorizeCreateRequest, getNow } from './httpSupport'
import type { PairingHttpOptions } from './httpTypes'
import { createJsonBodyValidator } from './httpValidation'
import { renderPairingLandingHtml } from './landingPage'

export type { PairingHttpOptions } from './httpTypes'

export function createPairingApp(options: PairingHttpOptions): Hono {
    const app = new Hono()

    app.get('/health', (c) => c.json({ ok: true, service: 'pairing' }))
    app.get('/', (c) => c.json({ ok: true, service: 'viby-pairing', pairingBaseUrl: options.publicUrl }))
    app.get('/p/:id', (c) => c.html(renderPairingLandingHtml(c.req.param('id'))))
    app.get('/metrics', (c) => {
        const authError = authorizeCreateRequest(options, c.req.header('authorization'))
        if (authError) {
            return authError
        }
        return c.json(options.metrics?.snapshot(getNow(options.now)) ?? { counters: {}, now: getNow(options.now) })
    })

    registerPairingSessionRoutes(app, options, {
        createPairingBodyValidator: createJsonBodyValidator(PairingCreateRequestSchema, 'Invalid pairing create body'),
        claimPairingBodyValidator: createJsonBodyValidator(PairingClaimRequestSchema, 'Invalid pairing claim body'),
    })
    registerPairingReconnectRoutes(app, options)

    return app
}
