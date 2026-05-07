import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportCodexLocalSession, listCodexLocalSessions } from './localSessionRecoveryCodex'

let codexHome: string

async function writeCodexSession(input: {
    cwd: string
    id: string
    timestamp: string
    events?: unknown[]
    trailingRawLines?: string[]
}): Promise<void> {
    const directory = join(codexHome, 'sessions', '2026', '05', '07')
    await mkdir(directory, { recursive: true })
    const filePath = join(directory, `rollout-${input.timestamp}_${input.id}.jsonl`)
    const lines = [
        {
            type: 'session_meta',
            timestamp: input.timestamp,
            payload: { id: input.id, cwd: input.cwd, timestamp: input.timestamp },
        },
        ...(input.events ?? []),
    ].map((line) => JSON.stringify(line))
    await writeFile(filePath, `${[...lines, ...(input.trailingRawLines ?? [])].join('\n')}\n`, 'utf8')
}

describe('localSessionRecoveryCodex', () => {
    beforeEach(async () => {
        codexHome = await mkdtemp(join(tmpdir(), 'viby-codex-sessions-'))
        vi.stubEnv('CODEX_HOME', codexHome)
    })

    afterEach(async () => {
        vi.unstubAllEnvs()
        await rm(codexHome, { recursive: true, force: true })
    })

    it('filters by session_meta before parsing full Codex transcripts', async () => {
        await writeCodexSession({
            cwd: '/repo',
            id: 'codex-session-1',
            timestamp: '2026-05-07T01:00:00.000Z',
            events: [
                {
                    type: 'event_msg',
                    timestamp: '2026-05-07T01:01:00.000Z',
                    payload: { type: 'user_message', message: 'Build fast scanner' },
                },
                {
                    type: 'event_msg',
                    timestamp: '2026-05-07T01:02:00.000Z',
                    payload: { type: 'agent_message', message: 'Scanner ready' },
                },
            ],
        })
        await writeCodexSession({
            cwd: '/other',
            id: 'codex-session-other',
            timestamp: '2026-05-07T02:00:00.000Z',
            trailingRawLines: ['{this would fail if the non-matching file was fully parsed'],
        })

        await expect(listCodexLocalSessions('/repo')).resolves.toEqual([
            expect.objectContaining({
                driver: 'codex',
                providerSessionId: 'codex-session-1',
                title: 'Build fast scanner',
                messageCount: 2,
            }),
        ])
    })

    it('exports only the selected Codex session transcript', async () => {
        await writeCodexSession({
            cwd: '/repo',
            id: 'codex-session-2',
            timestamp: '2026-05-07T01:00:00.000Z',
            events: [
                {
                    type: 'event_msg',
                    timestamp: '2026-05-07T01:01:00.000Z',
                    payload: { type: 'user_message', message: 'Recover me' },
                },
                {
                    type: 'event_msg',
                    timestamp: '2026-05-07T01:02:00.000Z',
                    payload: { type: 'agent_message', message: 'Recovered' },
                },
            ],
        })

        await expect(exportCodexLocalSession('/repo', 'codex-session-2')).resolves.toMatchObject({
            providerSessionId: 'codex-session-2',
            messages: [
                { role: 'user', text: 'Recover me', createdAt: Date.parse('2026-05-07T01:01:00.000Z') },
                { role: 'agent', text: 'Recovered', createdAt: Date.parse('2026-05-07T01:02:00.000Z') },
            ],
        })
    })
})
