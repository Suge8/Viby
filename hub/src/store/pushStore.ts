import type { Database } from 'bun:sqlite'

import type { StoredPushSubscription } from './types'
import { addPushSubscription, getPushSubscriptions, removePushSubscription } from './pushSubscriptions'

export class PushStore {
    private readonly db: Database

    constructor(db: Database) {
        this.db = db
    }

    addPushSubscription(subscription: { endpoint: string; p256dh: string; auth: string }): void {
        addPushSubscription(this.db, subscription)
    }

    removePushSubscription(endpoint: string): void {
        removePushSubscription(this.db, endpoint)
    }

    getPushSubscriptions(): StoredPushSubscription[] {
        return getPushSubscriptions(this.db)
    }
}
