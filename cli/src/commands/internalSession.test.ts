import fs from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    initializeToken: vi.fn(async () => {}),
    authAndSetupMachineIfNeeded: vi.fn(async () => {}),
    runClaude: vi.fn(async () => {}),
    runCodex: vi.fn(async () => {}),
    runCursor: vi.fn(async () => {}),
    runGemini: vi.fn(async () => {}),
    runOpencode: vi.fn(async () => {}),
    runPi: vi.fn(async () => {}),
}))

vi.mock('@/ui/tokenInit', () => ({
    initializeToken: harness.initializeToken
}))

vi.mock('@/ui/auth', () => ({
    authAndSetupMachineIfNeeded: harness.authAndSetupMachineIfNeeded
}))

vi.mock('@/claude/runClaude', () => ({
    runClaude: harness.runClaude
}))

vi.mock('@/codex/runCodex', () => ({
    runCodex: harness.runCodex
}))

vi.mock('@/cursor/runCursor', () => ({
    runCursor: harness.runCursor
}))

vi.mock('@/gemini/runGemini', () => ({
    runGemini: harness.runGemini
}))

vi.mock('@/opencode/runOpencode', () => ({
    runOpencode: harness.runOpencode
}))

vi.mock('@/pi/runPi', () => ({
    runPi: harness.runPi
}))

import {
    internalSessionCommand,
    parseInternalSessionArgs,
    resolveInternalSessionOptions,
} from './internalSession'

const cleanupPaths = new Set<string>()

async function createHandoffFile(content: string): Promise<string> {
    const directory = await fs.mkdtemp(join(os.tmpdir(), 'viby-internal-session-test-'))
    cleanupPaths.add(directory)
    const handoffFilePath = join(directory, 'handoff.json')
    await fs.writeFile(handoffFilePath, content, 'utf8')
    return handoffFilePath
}

function createValidHandoffPayload(): string {
    return JSON.stringify({
        driver: 'claude',
        workingDirectory: '/tmp/project',
        liveConfig: {
            model: 'claude-sonnet',
            modelReasoningEffort: 'high',
            permissionMode: 'default'
        },
        history: [],
        attachments: []
    })
}

beforeEach(() => {
    harness.initializeToken.mockClear()
    harness.authAndSetupMachineIfNeeded.mockClear()
    harness.runClaude.mockClear()
    harness.runCodex.mockClear()
    harness.runCursor.mockClear()
    harness.runGemini.mockClear()
    harness.runOpencode.mockClear()
    harness.runPi.mockClear()
})

afterEach(async () => {
    await Promise.all(Array.from(cleanupPaths, async (path) => {
        cleanupPaths.delete(path)
        await fs.rm(path, { recursive: true, force: true })
    }))
})

describe('internalSession', () => {
    it('parses driver-switch argv without requiring a resume token', () => {
        expect(parseInternalSessionArgs([
            '--agent', 'codex',
            '--started-by', 'runner',
            '--driver-switch-target', 'codex',
            '--driver-switch-handoff-file', '/tmp/handoff.json'
        ])).toEqual(expect.objectContaining({
            agent: 'codex',
            startedBy: 'runner',
            resumeSessionId: undefined,
            driverSwitchTarget: 'codex',
            driverSwitchHandoffFile: '/tmp/handoff.json'
        }))
    })

    it('accepts pi as an internal agent flavor', () => {
        expect(parseInternalSessionArgs([
            '--agent', 'pi',
            '--started-by', 'runner',
            '--viby-session-id', 'session-pi'
        ])).toEqual(expect.objectContaining({
            agent: 'pi',
            startedBy: 'runner',
            vibySessionId: 'session-pi'
        }))
    })

    it('loads a valid driver-switch handoff and forwards it to Codex bootstrap', async () => {
        const handoffFilePath = await createHandoffFile(createValidHandoffPayload())

        const options = await resolveInternalSessionOptions([
            '--agent', 'codex',
            '--started-by', 'runner',
            '--viby-session-id', 'session-1',
            '--driver-switch-target', 'codex',
            '--driver-switch-handoff-file', handoffFilePath
        ])

        expect(options.driverSwitch).toEqual({
            targetDriver: 'codex',
            handoffSnapshot: {
                driver: 'claude',
                workingDirectory: '/tmp/project',
                liveConfig: {
                    model: 'claude-sonnet',
                    modelReasoningEffort: 'high',
                    permissionMode: 'default'
                },
                history: [],
                attachments: []
            }
        })

        await internalSessionCommand.run({
            args: [],
            commandArgs: [
                '--agent', 'codex',
                '--started-by', 'runner',
                '--viby-session-id', 'session-1',
                '--driver-switch-target', 'codex',
                '--driver-switch-handoff-file', handoffFilePath
            ]
        })

        expect(harness.initializeToken).toHaveBeenCalledTimes(1)
        expect(harness.authAndSetupMachineIfNeeded).toHaveBeenCalledTimes(1)
        expect(harness.runCodex).toHaveBeenCalledWith(expect.objectContaining({
            vibySessionId: 'session-1',
            resumeSessionId: undefined,
            driverSwitchHandoff: expect.objectContaining({
                driver: 'claude',
                workingDirectory: '/tmp/project'
            })
        }))
    })

    it('rejects malformed switch bootstrap inputs explicitly', async () => {
        await expect(resolveInternalSessionOptions([
            '--agent', 'codex',
            '--driver-switch-target', 'codex'
        ])).rejects.toThrow('Missing --driver-switch-handoff-file value')

        await expect(resolveInternalSessionOptions([
            '--agent', 'codex',
            '--driver-switch-target', 'gemini',
            '--driver-switch-handoff-file', '/tmp/handoff.json'
        ])).rejects.toThrow('Unsupported driver switch target: gemini')

        const invalidJsonPath = await createHandoffFile('{bad json')
        await expect(resolveInternalSessionOptions([
            '--agent', 'codex',
            '--driver-switch-target', 'codex',
            '--driver-switch-handoff-file', invalidJsonPath
        ])).rejects.toThrow('Invalid driver switch handoff JSON')
    })

    it('rejects a switch bootstrap whose target driver does not match the spawned agent', async () => {
        const handoffFilePath = await createHandoffFile(createValidHandoffPayload())

        await expect(resolveInternalSessionOptions([
            '--agent', 'claude',
            '--driver-switch-target', 'codex',
            '--driver-switch-handoff-file', handoffFilePath
        ])).rejects.toThrow('does not match agent claude')
    })

    it('forwards Pi config through the internal spawn entrypoint', async () => {
        await internalSessionCommand.run({
            args: [],
            commandArgs: [
                '--agent', 'pi',
                '--started-by', 'runner',
                '--viby-session-id', 'session-pi',
                '--permission-mode', 'safe-yolo',
                '--model', 'openai/gpt-5.4-mini',
                '--model-reasoning-effort', 'high'
            ]
        })

        expect(harness.runPi).toHaveBeenCalledWith({
            startedBy: 'runner',
            vibySessionId: 'session-pi',
            sessionRole: undefined,
            permissionMode: 'safe-yolo',
            model: 'openai/gpt-5.4-mini',
            modelReasoningEffort: 'high'
        })
    })

    it('rejects provider resume tokens for Pi sessions', async () => {
        await expect(internalSessionCommand.run({
            args: [],
            commandArgs: [
                '--agent', 'pi',
                '--started-by', 'runner',
                '--resume-session-id', 'pi-provider-session'
            ]
        })).rejects.toThrow('Pi does not support provider resume session ids')
    })
})
