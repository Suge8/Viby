import type { Session } from '@viby/protocol/types'

export class SessionListSnapshotCache {
    private revision = 0
    private snapshot: Session[] | null = null

    markDirty(): void {
        this.revision += 1
        this.snapshot = null
    }

    getRevision(): number {
        return this.revision
    }

    getSnapshot(sessions: ReadonlyMap<string, Session>): Session[] {
        if (!this.snapshot) {
            this.snapshot = Array.from(sessions.values())
        }

        return this.snapshot
    }
}
