import type { Database } from 'bun:sqlite'

import type { StoredPushSubscription } from './types'

type DbPushSubscriptionRow = {
    id: number
    endpoint: string
    p256dh: string
    auth: string
    created_at: number
}

function toStoredPushSubscription(row: DbPushSubscriptionRow): StoredPushSubscription {
    return {
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        createdAt: row.created_at
    }
}

export function addPushSubscription(
    db: Database,
    subscription: { endpoint: string; p256dh: string; auth: string }
): void {
    const now = Date.now()
    db.prepare(`
        INSERT INTO push_subscriptions (
            endpoint, p256dh, auth, created_at
        ) VALUES (
            @endpoint, @p256dh, @auth, @created_at
        )
        ON CONFLICT(endpoint)
        DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            created_at = excluded.created_at
    `).run({
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        created_at: now
    })
}

export function removePushSubscription(db: Database, endpoint: string): void {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint)
}

export function getPushSubscriptions(db: Database): StoredPushSubscription[] {
    const rows = db.prepare(
        'SELECT * FROM push_subscriptions ORDER BY created_at DESC'
    ).all() as DbPushSubscriptionRow[]
    return rows.map(toStoredPushSubscription)
}
