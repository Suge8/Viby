import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'
import { createJsonBodyValidator } from './sessionRouteSupport'

const subscriptionSchema = z.object({
    endpoint: z.string().min(1),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
    }),
})

const unsubscribeSchema = z.object({
    endpoint: z.string().min(1),
})

export function createPushRoutes(store: Store, vapidPublicKey: string): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/push/vapid-public-key', (c) => {
        return c.json({ publicKey: vapidPublicKey })
    })

    app.post('/push/subscribe', createJsonBodyValidator(subscriptionSchema), async (c) => {
        const { endpoint, keys } = c.req.valid('json')
        store.push.addPushSubscription({
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
        })

        return c.json({ ok: true })
    })

    app.delete('/push/subscribe', createJsonBodyValidator(unsubscribeSchema), async (c) => {
        store.push.removePushSubscription(c.req.valid('json').endpoint)
        return c.json({ ok: true })
    })

    return app
}
