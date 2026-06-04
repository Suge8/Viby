import type { OpencodeStorageSource } from './opencodeStorageDatabase'
import { listSessionInfoFiles, normalizePath, readSessionInfo } from './opencodeStorageScannerSupport'

export type SessionCandidate = { sessionId: string; score: number; source: OpencodeStorageSource }

export async function discoverOpencodeFileSessionId(options: {
    storageDir: string
    targetCwd: string
    referenceTimestampMs: number
    sessionStartWindowMs: number
}): Promise<SessionCandidate | null> {
    const sessionFiles = await listSessionInfoFiles(options.storageDir)
    let best: SessionCandidate | null = null

    for (const filePath of sessionFiles) {
        const info = await readSessionInfo(filePath)
        if (!info || !info.id || !info.directory || info.timeCreated === null) continue
        if (normalizePath(info.directory) !== options.targetCwd) continue
        if (info.timeCreated < options.referenceTimestampMs) continue

        const diff = info.timeCreated - options.referenceTimestampMs
        if (diff > options.sessionStartWindowMs) continue
        if (!best || diff < best.score) {
            best = { sessionId: info.id, score: diff, source: 'files' }
        }
    }

    return best
}
