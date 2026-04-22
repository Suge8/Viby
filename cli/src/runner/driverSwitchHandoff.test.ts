import fs from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'

import {
    DRIVER_SWITCH_HANDOFF_IO_TIMEOUT_MS,
    loadDriverSwitchHandoff,
    MAX_DRIVER_SWITCH_HANDOFF_BYTES,
    parseDriverSwitchTarget,
    writeDriverSwitchHandoffTransport,
} from './driverSwitchHandoff'

function createHandoffSnapshot() {
    return {
        driver: 'claude' as const,
        workingDirectory: '/tmp/project',
        liveConfig: {
            model: 'claude-sonnet',
            modelReasoningEffort: 'high' as const,
            permissionMode: 'default' as const,
            collaborationMode: undefined,
        },
        history: [
            {
                id: 'message-1',
                seq: 1,
                createdAt: 1,
                role: 'user' as const,
                text: 'hello',
            },
        ],
        attachments: [],
    }
}

const cleanupPaths = new Set<string>()

afterEach(async () => {
    await Promise.all(
        Array.from(cleanupPaths, async (path) => {
            cleanupPaths.delete(path)
            await fs.rm(path, { recursive: true, force: true })
        })
    )
})

describe('driverSwitchHandoff', () => {
    it('writes a bounded handoff file and removes it during cleanup', async () => {
        const transport = await writeDriverSwitchHandoffTransport({
            targetDriver: 'codex',
            handoffSnapshot: createHandoffSnapshot(),
        })

        cleanupPaths.add(transport.handoffFilePath)

        const payload = await fs.readFile(transport.handoffFilePath, 'utf8')
        expect(Buffer.byteLength(payload)).toBeLessThan(MAX_DRIVER_SWITCH_HANDOFF_BYTES)
        expect(transport.targetDriver).toBe('codex')

        await transport.cleanup()
        cleanupPaths.delete(transport.handoffFilePath)

        await expect(fs.access(transport.handoffFilePath)).rejects.toThrow()
    })

    it('loads and validates a handoff file for the matching target agent', async () => {
        const transport = await writeDriverSwitchHandoffTransport({
            targetDriver: 'claude',
            handoffSnapshot: createHandoffSnapshot(),
        })

        cleanupPaths.add(transport.handoffFilePath)

        await expect(
            loadDriverSwitchHandoff({
                targetDriver: 'claude',
                handoffFilePath: transport.handoffFilePath,
                expectedAgent: 'claude',
            })
        ).resolves.toEqual({
            targetDriver: 'claude',
            handoffSnapshot: createHandoffSnapshot(),
        })
    })

    it('rejects invalid JSON, target mismatches, and oversized handoff payloads explicitly', async () => {
        const tempDirectory = await fs.mkdtemp('/tmp/viby-driver-switch-invalid-')
        cleanupPaths.add(tempDirectory)
        const handoffFilePath = `${tempDirectory}/handoff.json`
        await fs.writeFile(handoffFilePath, '{bad json')

        await expect(
            loadDriverSwitchHandoff({
                targetDriver: 'codex',
                handoffFilePath,
                expectedAgent: 'codex',
            })
        ).rejects.toThrow('Invalid driver switch handoff JSON')

        await expect(
            loadDriverSwitchHandoff({
                targetDriver: 'claude',
                handoffFilePath,
                expectedAgent: 'codex',
            })
        ).rejects.toThrow('does not match agent codex')

        const oversizedSnapshot = {
            ...createHandoffSnapshot(),
            history: [
                {
                    id: 'message-1',
                    seq: 1,
                    createdAt: 1,
                    role: 'user' as const,
                    text: 'x'.repeat(MAX_DRIVER_SWITCH_HANDOFF_BYTES),
                },
            ],
        }

        await expect(
            writeDriverSwitchHandoffTransport({
                targetDriver: 'claude',
                handoffSnapshot: oversizedSnapshot,
            })
        ).rejects.toThrow(`exceeds ${MAX_DRIVER_SWITCH_HANDOFF_BYTES} bytes`)
    })

    it('rejects unsupported switch targets before any transport work starts', () => {
        expect(parseDriverSwitchTarget('gemini')).toBe('gemini')
        expect(parseDriverSwitchTarget('opencode')).toBe('opencode')
        expect(parseDriverSwitchTarget('pi')).toBe('pi')
        expect(() => parseDriverSwitchTarget('unknown')).toThrow('Unsupported driver switch target: unknown')
        expect(DRIVER_SWITCH_HANDOFF_IO_TIMEOUT_MS).toBeGreaterThan(0)
    })
})
