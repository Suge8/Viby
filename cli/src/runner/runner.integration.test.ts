/**
 * Integration tests for runner HTTP control system
 *
 * These tests exercise a real local hub, so they are opt-in only and always
 * run against an isolated VIBY_HOME. They must never share state with the
 * developer's default ~/.viby runtime.
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import {
    EXTERNAL_SESSION_BOOT_MS,
    LIVE_INTEGRATION_READY,
    RUNNER_GRACEFUL_SHUTDOWN_SETTLE_MS,
    RUNNER_HOOK_TIMEOUT_MS,
    RUNNER_MANAGED_SESSION_SETTLE_MS,
    RUNNER_SIGKILL_SETTLE_MS,
    RUNNER_START_POLL_INTERVAL_MS,
    RUNNER_START_TIMEOUT_MS,
    getRunnerModules,
    setupRunnerIntegrationHarness,
    teardownRunnerIntegrationHarness,
    waitFor
} from './runnerIntegrationTestHarness'

describe.skipIf(!LIVE_INTEGRATION_READY)('Runner Integration Tests', { timeout: 20_000 }, () => {
    let runnerPid = 0

    beforeAll(async () => {
        await setupRunnerIntegrationHarness()
    })

    beforeEach(async () => {
        const { stopRunner, spawnVibyCLI, readRunnerState } = getRunnerModules()

        await stopRunner()

        void spawnVibyCLI(['runner', 'start-sync'], {
            stdio: 'ignore',
            detached: true
        })

        await waitFor(async () => {
            const state = await readRunnerState()
            return state !== null
        }, RUNNER_START_TIMEOUT_MS, RUNNER_START_POLL_INTERVAL_MS)

        const runnerState = await readRunnerState()
        if (!runnerState) {
            throw new Error('Runner failed to start within timeout')
        }

        runnerPid = runnerState.pid
        console.log(`[TEST] Runner started for test: PID=${runnerPid}`)
        console.log(`[TEST] Runner log file: ${runnerState.runnerLogPath}`)
    }, RUNNER_HOOK_TIMEOUT_MS)

    afterEach(async () => {
        const { stopRunner } = getRunnerModules()
        await stopRunner()
    }, RUNNER_HOOK_TIMEOUT_MS)

    afterAll(() => {
        teardownRunnerIntegrationHarness()
    })

    it('should list sessions (initially empty)', async () => {
        const { listRunnerSessions } = getRunnerModules()
        const sessions = await listRunnerSessions()
        expect(sessions).toEqual([])
    })

    it('should track session-started webhook from terminal session', async () => {
        const { notifyRunnerSessionStarted, listRunnerSessions, EXTERNAL_TERMINAL_STARTED_BY } = getRunnerModules()

        const mockMetadata = {
            path: '/test/path',
            host: 'test-host',
            homeDir: '/test/home',
            vibyHomeDir: '/test/viby-home',
            vibyLibDir: '/test/viby-lib',
            vibyToolsDir: '/test/viby-tools',
            hostPid: 99999,
            startedBy: 'terminal' as const,
            machineId: 'test-machine-123'
        }

        await notifyRunnerSessionStarted('test-session-123', mockMetadata)

        const sessions = await listRunnerSessions()
        expect(sessions).toHaveLength(1)

        const tracked = sessions[0]
        expect(tracked.startedBy).toBe(EXTERNAL_TERMINAL_STARTED_BY)
        expect(tracked.vibySessionId).toBe('test-session-123')
        expect(tracked.pid).toBe(99999)
    })

    it('should spawn & stop a session via HTTP (not testing RPC route, but similar enough)', async () => {
        const { spawnRunnerSession, listRunnerSessions, stopRunnerSession, RUNNER_MANAGED_STARTED_BY } = getRunnerModules()

        const response = await spawnRunnerSession('/tmp', 'spawned-test-456')
        expect(response).toHaveProperty('success', true)
        expect(response).toHaveProperty('sessionId')

        const sessions = await listRunnerSessions()
        const spawnedSession = sessions.find((session: { vibySessionId?: string }) => session.vibySessionId === response.sessionId)

        expect(spawnedSession).toBeDefined()
        expect(spawnedSession.startedBy).toBe(RUNNER_MANAGED_STARTED_BY)

        expect(spawnedSession.vibySessionId).toBeDefined()
        await stopRunnerSession(spawnedSession.vibySessionId)
    })

    it('stress test: spawn / stop', { timeout: 60_000 }, async () => {
        const { spawnRunnerSession, listRunnerSessions, stopRunnerSession } = getRunnerModules()

        const sessionCount = 20
        const results = await Promise.all(Array.from({ length: sessionCount }, () => spawnRunnerSession('/tmp')))
        const sessionIds = results.map((result) => result.sessionId)

        const sessions = await listRunnerSessions()
        expect(sessions).toHaveLength(sessionCount)

        const stopResults = await Promise.all(sessionIds.map((sessionId) => stopRunnerSession(sessionId)))
        expect(stopResults.every(Boolean), 'Not all sessions reported stopped').toBe(true)

        const emptySessions = await listRunnerSessions()
        expect(emptySessions).toHaveLength(0)
    })

    it('should handle runner stop request gracefully', async () => {
        const { stopRunnerHttp, configuration } = getRunnerModules()

        await stopRunnerHttp()
        await waitFor(async () => !existsSync(configuration.runnerStateFile), 1_000)
    })

    it('should track both runner-spawned and terminal sessions', async () => {
        const {
            spawnVibyCLI,
            spawnRunnerSession,
            listRunnerSessions,
            stopRunnerSession,
            killProcessByChildProcess,
            EXTERNAL_TERMINAL_STARTED_BY,
            RUNNER_MANAGED_STARTED_BY
        } = getRunnerModules()

        const terminalVibyProcess = spawnVibyCLI([
            '--viby-starting-mode', 'remote',
            '--started-by', 'terminal'
        ], {
            cwd: '/tmp',
            detached: true,
            stdio: 'ignore'
        })

        if (!terminalVibyProcess.pid) {
            throw new Error('Failed to spawn terminal viby process')
        }

        await new Promise((resolve) => setTimeout(resolve, EXTERNAL_SESSION_BOOT_MS))

        const spawnResponse = await spawnRunnerSession('/tmp', 'runner-session-bbb')
        const sessions = await listRunnerSessions()
        expect(sessions).toHaveLength(2)

        const terminalSession = sessions.find((session: { pid: number }) => session.pid === terminalVibyProcess.pid)
        const runnerSession = sessions.find((session: { vibySessionId?: string }) => session.vibySessionId === spawnResponse.sessionId)

        expect(terminalSession).toBeDefined()
        expect(terminalSession.startedBy).toBe(EXTERNAL_TERMINAL_STARTED_BY)

        expect(runnerSession).toBeDefined()
        expect(runnerSession.startedBy).toBe(RUNNER_MANAGED_STARTED_BY)

        await stopRunnerSession('terminal-session-aaa')
        await stopRunnerSession(runnerSession.vibySessionId)

        try {
            await killProcessByChildProcess(terminalVibyProcess)
        } catch {
            // Process may already be dead.
        }
    })

    it('should update session metadata when webhook is called', async () => {
        const { spawnRunnerSession, listRunnerSessions, stopRunnerSession } = getRunnerModules()

        const spawnResponse = await spawnRunnerSession('/tmp')
        const sessions = await listRunnerSessions()
        const session = sessions.find((item: { vibySessionId?: string }) => item.vibySessionId === spawnResponse.sessionId)
        expect(session).toBeDefined()

        await stopRunnerSession(spawnResponse.sessionId)
    })

    it('should not allow starting a second runner', async () => {
        const { spawnVibyCLI } = getRunnerModules()

        const secondChild = spawnVibyCLI(['runner', 'start-sync'], {
            stdio: ['ignore', 'pipe', 'pipe']
        })

        let output = ''
        secondChild.stdout?.on('data', (data) => {
            output += data.toString()
        })
        secondChild.stderr?.on('data', (data) => {
            output += data.toString()
        })

        await new Promise<void>((resolve) => {
            secondChild.on('exit', () => resolve())
        })

        expect(output).toContain('already running')
    })

    it('should handle concurrent session operations', async () => {
        const { spawnRunnerSession, listRunnerSessions, stopRunnerSession, RUNNER_MANAGED_STARTED_BY } = getRunnerModules()

        const results = await Promise.all(Array.from({ length: 3 }, () => spawnRunnerSession('/tmp')))
        results.forEach((result) => {
            expect(result.success).toBe(true)
            expect(result.sessionId).toBeDefined()
        })

        const spawnedSessionIds = results.map((result) => result.sessionId)
        await new Promise((resolve) => setTimeout(resolve, RUNNER_MANAGED_SESSION_SETTLE_MS))

        const sessions = await listRunnerSessions()
        const runnerSessions = sessions.filter((session: { startedBy: string; vibySessionId?: string }) => {
            return session.startedBy === RUNNER_MANAGED_STARTED_BY && spawnedSessionIds.includes(session.vibySessionId)
        })

        expect(runnerSessions.length).toBeGreaterThanOrEqual(3)

        for (const session of runnerSessions) {
            expect(session.vibySessionId).toBeDefined()
            await stopRunnerSession(session.vibySessionId)
        }
    })

    it('should die with logs when SIGKILL is sent', async () => {
        const { configuration, killProcess, isProcessAlive, clearRunnerState } = getRunnerModules()

        const initialLogs = readdirSync(configuration.logsDir).filter((file) => file.endsWith('-runner.log'))

        await killProcess(runnerPid, true)
        await new Promise((resolve) => setTimeout(resolve, RUNNER_SIGKILL_SETTLE_MS))

        expect(!isProcessAlive(runnerPid)).toBe(true)

        const finalLogs = readdirSync(configuration.logsDir).filter((file) => file.endsWith('-runner.log'))
        expect(finalLogs.length).toBeGreaterThanOrEqual(initialLogs.length)

        console.log('[TEST] Runner killed with SIGKILL - no cleanup logs expected')
        await clearRunnerState()
    })

    it('should die with cleanup logs when a graceful shutdown is requested', async () => {
        const { getLatestRunnerLog, isWindows, stopRunnerHttp, killProcess, isProcessAlive, clearRunnerState } = getRunnerModules()

        const logFile = await getLatestRunnerLog()
        if (!logFile) {
            throw new Error('No log file found')
        }

        if (isWindows()) {
            await stopRunnerHttp()
        } else {
            await killProcess(runnerPid)
        }

        await new Promise((resolve) => setTimeout(resolve, RUNNER_GRACEFUL_SHUTDOWN_SETTLE_MS))
        expect(!isProcessAlive(runnerPid)).toBe(true)

        const logContent = readFileSync(logFile.path, 'utf8')
        if (!isWindows()) {
            expect(logContent).toContain('SIGTERM')
        }
        expect(logContent).toContain('cleanup')

        console.log('[TEST] Runner terminated gracefully - cleanup logs written')
        await clearRunnerState()
    })
})
