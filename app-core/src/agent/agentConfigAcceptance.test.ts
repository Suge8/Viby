import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type AgentConfigDriver, type AgentConfigVersionState, getAgentConfigSupportedVersion } from '@viby/protocol'
import { afterEach, describe, expect, it } from 'vitest'
import { runAgentConfigAcceptance } from './agentConfigAcceptance'

const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-agent-config-acceptance-test-'))
    tempDirs.push(path)
    return path
}

afterEach(() => {
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true })
    }
})

function versionState(driver: AgentConfigDriver, status: AgentConfigVersionState['status']): AgentConfigVersionState {
    const requirement = getAgentConfigSupportedVersion(driver)
    return {
        status,
        supportedVersion: requirement.version,
        source: requirement.source,
        installedVersion: status === 'supported' ? requirement.version : '0.0.1',
        command: `${driver} --version`,
        checkedAt: 1,
    }
}

describe('agent config acceptance', () => {
    it('writes every supported config in isolated real paths and records command starts', async () => {
        const rows = await runAgentConfigAcceptance({
            root: makeTempDir(),
            commandExists: async (command) => command === 'codex',
            runCommand: async (cmd) => ({ code: cmd[0] === 'codex' ? 0 : 1, output: `${cmd.join(' ')} ok` }),
            readVersion: async (driver) => versionState(driver, 'supported'),
        })

        expect(rows).toHaveLength(5)
        expect(rows.every((row) => row.configWrite === 'passed')).toBe(true)
        expect(rows.find((row) => row.driver === 'codex')).toMatchObject({
            command: 'codex --version',
            commandStart: 'passed',
        })
        expect(rows.filter((row) => row.commandStart === 'skipped')).toHaveLength(4)
        expect(rows.find((row) => row.driver === 'gemini')?.configPath).toContain('.gemini/settings.json')
    })

    it('still writes when version is outdated — checks are advisory', async () => {
        const rows = await runAgentConfigAcceptance({
            root: makeTempDir(),
            commandExists: async () => true,
            runCommand: async (cmd) => ({ code: 0, output: `${cmd.join(' ')} ok` }),
            readVersion: async (driver) => versionState(driver, driver === 'codex' ? 'outdated' : 'supported'),
        })

        expect(rows.find((row) => row.driver === 'codex')).toMatchObject({
            versionStatus: 'outdated',
            configWrite: 'passed',
            commandStart: 'passed',
        })
        expect(rows.every((row) => row.configWrite === 'passed')).toBe(true)
    })
})
