import { join } from 'node:path'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import {
    filenameToId,
    getMessageTimestamp,
    getNumber,
    getString,
    listJsonFiles,
    listSessionInfoFiles,
    readJsonRecord,
    readMtime,
    readSessionInfo,
    resolveOpencodeStorageDir,
} from '@/opencode/utils/opencodeStorageScannerSupport'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    isLocalSessionPathMatch,
    mapWithConcurrency,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

type ResolvedOpencodeSessionInfo = {
    id: string
    directory: string
    timeCreated: number | null
}

async function collectOpencodeMessageText(options: {
    storageDir: string
    messageId: string
    role: string
    fallbackCreatedAt: number
}): Promise<{ text: string | null; updatedAt: number }> {
    const partDir = join(options.storageDir, 'part', options.messageId)
    const partFiles = await listJsonFiles(partDir)
    const textParts = await Promise.all(
        partFiles.map(async (filePath) => {
            const part = await readJsonRecord(filePath)
            if (!part || getString(part.type) !== 'text') {
                return null
            }

            const text = trimLocalSessionText(part.text)
            if (!text) {
                return null
            }

            const time = isRecord(part.time) ? part.time : null
            const createdAt =
                getNumber(time?.end) ??
                getNumber(time?.start) ??
                getNumber(time?.created) ??
                (await readMtime(filePath)) ??
                options.fallbackCreatedAt

            if (options.role === 'user' || part.synthetic === true || getNumber(time?.end) !== null) {
                return {
                    text,
                    createdAt,
                }
            }

            return null
        })
    )

    const visibleParts = textParts
        .filter((part): part is NonNullable<typeof part> => Boolean(part))
        .sort((left, right) => {
            return left.createdAt - right.createdAt
        })

    if (visibleParts.length === 0) {
        return {
            text: null,
            updatedAt: options.fallbackCreatedAt,
        }
    }

    return {
        text: visibleParts.map((part) => part.text).join('\n\n'),
        updatedAt: visibleParts.at(-1)?.createdAt ?? options.fallbackCreatedAt,
    }
}

async function resolveOpencodeSessionInfo(
    workingDirectory: string,
    providerSessionId: string
): Promise<ResolvedOpencodeSessionInfo | null> {
    const storageDir = resolveOpencodeStorageDir()
    const sessionInfoFiles = await listSessionInfoFiles(storageDir)
    const matchedInfo = (
        await mapWithConcurrency(sessionInfoFiles, 8, async (filePath) => {
            const info = await readSessionInfo(filePath)
            if (!info?.id || !info.directory) {
                return null
            }
            return info.id === providerSessionId && isLocalSessionPathMatch(info.directory, workingDirectory)
                ? {
                      id: info.id,
                      directory: info.directory,
                      timeCreated: info.timeCreated,
                  }
                : null
        })
    ).find((value): value is ResolvedOpencodeSessionInfo => Boolean(value))

    return matchedInfo ?? null
}

async function loadOpencodeSnapshotFromInfo(
    sessionInfo: ResolvedOpencodeSessionInfo
): Promise<LocalSessionExportSnapshot | null> {
    const storageDir = resolveOpencodeStorageDir()
    const messageDir = join(storageDir, 'message', sessionInfo.id)
    const messageFiles = await listJsonFiles(messageDir)
    const messageEntries = await Promise.all(
        messageFiles.map(async (filePath) => {
            const info = await readJsonRecord(filePath)
            if (!info) {
                return null
            }

            const messageId = getString(info.id) ?? filenameToId(filePath)
            const role = getString(info.role)
            if (!messageId || !role) {
                return null
            }

            const fallbackCreatedAt = getMessageTimestamp(info, await readMtime(filePath)) ?? Date.now()
            const textEntry = await collectOpencodeMessageText({
                storageDir,
                messageId,
                role,
                fallbackCreatedAt,
            })
            const text = trimLocalSessionText(textEntry.text)
            if (!text) {
                return null
            }

            return {
                role: role === 'user' ? ('user' as const) : ('agent' as const),
                text,
                createdAt: fallbackCreatedAt,
                updatedAt: textEntry.updatedAt,
            }
        })
    )

    const messages = messageEntries
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((entry) => ({
            role: entry.role,
            text: entry.text,
            createdAt: entry.createdAt,
        }))

    const updatedAt = messageEntries
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .reduce((current, entry) => Math.max(current, entry.updatedAt), sessionInfo.timeCreated ?? Date.now())

    return createLocalSessionSnapshot({
        driver: 'opencode',
        providerSessionId: sessionInfo.id,
        path: sessionInfo.directory,
        startedAt: sessionInfo.timeCreated ?? messages[0]?.createdAt ?? updatedAt,
        updatedAt,
        messages,
    })
}

async function loadOpencodeCatalogEntry(sessionInfo: ResolvedOpencodeSessionInfo): Promise<LocalSessionCatalogEntry> {
    const storageDir = resolveOpencodeStorageDir()
    const messageDir = join(storageDir, 'message', sessionInfo.id)
    const messageFiles = await listJsonFiles(messageDir)
    const messageMtimes = await mapWithConcurrency(messageFiles, 8, async (filePath) => await readMtime(filePath))
    const fallbackUpdatedAt = sessionInfo.timeCreated ?? Date.now()
    const updatedAt = messageMtimes.reduce<number>((current, value) => {
        return typeof value === 'number' ? Math.max(current, value) : current
    }, fallbackUpdatedAt)

    return createLocalSessionCatalogEntry({
        driver: 'opencode',
        providerSessionId: sessionInfo.id,
        path: sessionInfo.directory,
        startedAt: sessionInfo.timeCreated ?? updatedAt,
        updatedAt,
        messageCount: messageFiles.length,
    })
}

async function loadOpencodeSnapshots(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    const storageDir = resolveOpencodeStorageDir()
    const sessionInfoFiles = await listSessionInfoFiles(storageDir)
    const snapshots = await mapWithConcurrency(sessionInfoFiles, 8, async (filePath) => {
        const info = await readSessionInfo(filePath)
        if (!info?.id || !info.directory || !isLocalSessionPathMatch(info.directory, workingDirectory)) {
            return null
        }
        return await loadOpencodeCatalogEntry({
            id: info.id,
            directory: info.directory,
            timeCreated: info.timeCreated,
        })
    })

    return snapshots.filter((snapshot): snapshot is LocalSessionCatalogEntry => Boolean(snapshot))
}

export async function listOpencodeLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    return await loadOpencodeSnapshots(workingDirectory)
}

export async function exportOpencodeLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    const sessionInfo = await resolveOpencodeSessionInfo(workingDirectory, providerSessionId)
    const snapshot = sessionInfo ? await loadOpencodeSnapshotFromInfo(sessionInfo) : null
    if (!snapshot) {
        throw new Error(`OpenCode local session not found: ${providerSessionId}`)
    }
    return snapshot
}
