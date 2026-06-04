import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePiSessionDirectoryName, exportPiLocalSession, listPiLocalSessions } from './localSessionRecoveryPi'

let tempRoot: string
let sessionsRoot: string

async function writePiSession(input: {
    cwd: string
    id: string
    fileTimestamp: string
    messages: Array<{ role: 'user' | 'assistant' | 'toolResult'; content: unknown; timestamp: string }>
}): Promise<void> {
    const directory = join(sessionsRoot, encodePiSessionDirectoryName(input.cwd))
    await mkdir(directory, { recursive: true })
    const filePath = join(directory, `${input.fileTimestamp.replaceAll(':', '-')}_${input.id}.jsonl`)
    const lines = [
        { type: 'session', version: 3, id: input.id, timestamp: input.fileTimestamp, cwd: input.cwd },
        ...input.messages.map((message, index) => ({
            type: 'message',
            id: `message-${index}`,
            timestamp: message.timestamp,
            message: {
                role: message.role,
                content: message.content,
                timestamp: Date.parse(message.timestamp),
            },
        })),
    ]
    await writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
}

describe('localSessionRecoveryPi', () => {
    beforeEach(async () => {
        tempRoot = await mkdtemp(join(tmpdir(), 'viby-pi-sessions-'))
        sessionsRoot = join(tempRoot, '.pi', 'agent', 'sessions')
        vi.stubEnv('HOME', tempRoot)
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(tempRoot, { recursive: true, force: true })
    })

    it('lists provider-native Pi sessions for the selected project directory', async () => {
        await writePiSession({
            cwd: '/repo',
            id: 'pi-session-1',
            fileTimestamp: '2026-05-07T01:00:00.000Z',
            messages: [
                { role: 'user', content: 'Build the scanner', timestamp: '2026-05-07T01:01:00.000Z' },
                {
                    role: 'assistant',
                    content: [{ type: 'text', text: 'Scanner ready' }],
                    timestamp: '2026-05-07T01:02:00.000Z',
                },
            ],
        })
        await writePiSession({
            cwd: '/other',
            id: 'pi-session-other',
            fileTimestamp: '2026-05-07T02:00:00.000Z',
            messages: [{ role: 'user', content: 'Ignore me', timestamp: '2026-05-07T02:01:00.000Z' }],
        })

        await expect(listPiLocalSessions('/repo')).resolves.toEqual([
            expect.objectContaining({
                driver: 'pi',
                providerSessionId: 'pi-session-1',
                path: '/repo',
                title: 'Build the scanner',
                summary: 'Scanner ready',
                messageCount: 2,
            }),
        ])
    })

    it('exports visible Pi transcript text for Hub import', async () => {
        await writePiSession({
            cwd: '/repo',
            id: 'pi-session-2',
            fileTimestamp: '2026-05-07T01:00:00.000Z',
            messages: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Continue this' }],
                    timestamp: '2026-05-07T01:01:00.000Z',
                },
                {
                    role: 'toolResult',
                    content: [{ type: 'text', text: 'internal tool noise' }],
                    timestamp: '2026-05-07T01:01:30.000Z',
                },
                { role: 'assistant', content: [{ type: 'text', text: 'Done' }], timestamp: '2026-05-07T01:02:00.000Z' },
            ],
        })

        await expect(exportPiLocalSession('/repo', 'pi-session-2')).resolves.toMatchObject({
            driver: 'pi',
            providerSessionId: 'pi-session-2',
            title: 'Continue this',
            summary: 'Done',
            messages: [
                { role: 'user', text: 'Continue this', createdAt: Date.parse('2026-05-07T01:01:00.000Z') },
                { role: 'agent', text: 'Done', createdAt: Date.parse('2026-05-07T01:02:00.000Z') },
            ],
        })
    })
})
