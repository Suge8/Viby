import { approveAll, CopilotClient, type SessionMetadata } from '@github/copilot-sdk'
import type { LocalSessionCatalogEntry, LocalSessionExportSnapshot } from '@viby/protocol/types'
import {
    createLocalSessionCatalogEntry,
    createLocalSessionSnapshot,
    parseLocalSessionTimestamp,
    trimLocalSessionText,
} from './localSessionRecoverySupport'

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function mapCopilotEventMessage(
    event: unknown
): { role: 'user' | 'agent'; text: string; createdAt?: number | null } | null {
    if (!isRecord(event) || event.ephemeral === true || typeof event.type !== 'string') {
        return null
    }

    const data = isRecord(event.data) ? event.data : null
    const createdAt = parseLocalSessionTimestamp(event.timestamp)
    if (!data) {
        return null
    }

    if (event.type === 'user.message') {
        const text = trimLocalSessionText(data.content)
        return text ? { role: 'user', text, createdAt } : null
    }

    if (event.type === 'assistant.message') {
        const text = trimLocalSessionText(data.content)
        return text ? { role: 'agent', text, createdAt } : null
    }

    return null
}

async function withCopilotClient<T>(run: (client: CopilotClient) => Promise<T>): Promise<T> {
    const client = new CopilotClient({ useStdio: true })
    await client.start()
    try {
        return await run(client)
    } finally {
        await client.stop().catch(() => undefined)
    }
}

async function exportCopilotSessionWithClient(
    client: CopilotClient,
    workingDirectory: string,
    metadata: SessionMetadata
): Promise<LocalSessionExportSnapshot> {
    const session = await client.resumeSession(metadata.sessionId, {
        workingDirectory,
        streaming: false,
        disableResume: true,
        onPermissionRequest: approveAll,
    })

    try {
        const events = await session.getMessages()
        const messages = events
            .map((event) => mapCopilotEventMessage(event))
            .filter((event): event is NonNullable<typeof event> => Boolean(event))

        return createLocalSessionSnapshot({
            driver: 'copilot',
            providerSessionId: metadata.sessionId,
            path: metadata.context?.cwd ?? workingDirectory,
            summary: metadata.summary ?? null,
            startedAt: metadata.startTime.getTime(),
            updatedAt: metadata.modifiedTime.getTime(),
            messages,
        })
    } finally {
        await session.disconnect().catch(() => undefined)
    }
}

async function loadCopilotSnapshots(workingDirectory: string): Promise<LocalSessionExportSnapshot[]> {
    return await withCopilotClient(async (client) => {
        const sessions = await client.listSessions({ cwd: workingDirectory })
        const snapshots: LocalSessionExportSnapshot[] = []
        for (const metadata of sessions) {
            snapshots.push(await exportCopilotSessionWithClient(client, workingDirectory, metadata))
        }
        return snapshots
    })
}

export async function listCopilotLocalSessions(workingDirectory: string): Promise<LocalSessionCatalogEntry[]> {
    return await withCopilotClient(async (client) => {
        const sessions = await client.listSessions({ cwd: workingDirectory })
        return sessions.map((metadata) =>
            createLocalSessionCatalogEntry({
                driver: 'copilot',
                providerSessionId: metadata.sessionId,
                path: metadata.context?.cwd ?? workingDirectory,
                title: metadata.summary ?? metadata.sessionId,
                summary: metadata.summary ?? null,
                startedAt: metadata.startTime.getTime(),
                updatedAt: metadata.modifiedTime.getTime(),
            })
        )
    })
}

export async function exportCopilotLocalSession(
    workingDirectory: string,
    providerSessionId: string
): Promise<LocalSessionExportSnapshot> {
    return await withCopilotClient(async (client) => {
        const sessions = await client.listSessions({ cwd: workingDirectory })
        const metadata = sessions.find((entry) => entry.sessionId === providerSessionId)
        if (!metadata) {
            throw new Error(`Copilot local session not found: ${providerSessionId}`)
        }
        return await exportCopilotSessionWithClient(client, workingDirectory, metadata)
    })
}
