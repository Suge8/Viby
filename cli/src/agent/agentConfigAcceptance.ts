import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfigDriver, AgentConfigFieldValue, AgentConfigVersionState } from '@viby/protocol'
import { saveAgentConfigFile } from './agentConfigFiles'
import { readAgentConfigVersion } from './agentConfigVersions'

type CommandResult = { code: number; output: string }
type CommandRunner = (cmd: readonly string[], env: NodeJS.ProcessEnv) => Promise<CommandResult>
type CommandExists = (command: string) => Promise<boolean>
type VersionReader = (driver: AgentConfigDriver) => Promise<AgentConfigVersionState>

export type AgentConfigAcceptanceRow = {
    driver: AgentConfigDriver
    configPath: string
    supportedVersion: string
    installedVersion?: string
    versionStatus: string
    configWrite: 'passed' | 'blocked' | 'failed'
    commandStart: 'passed' | 'skipped' | 'failed'
    command?: string
    message?: string
}

type AcceptanceSpec = {
    driver: AgentConfigDriver
    env: (root: string) => NodeJS.ProcessEnv
    values: Record<string, AgentConfigFieldValue>
    commands: readonly (readonly string[])[]
}

const ACCEPTANCE_SPECS: readonly AcceptanceSpec[] = [
    {
        driver: 'codex',
        env: (root) => ({ CODEX_HOME: join(root, 'codex') }),
        values: { 'codex.history.persistence': 'none', 'codex.web_search': 'disabled' },
        commands: [['codex', '--version']],
    },
    {
        driver: 'claude',
        env: (root) => ({ CLAUDE_CONFIG_DIR: join(root, 'claude') }),
        values: { 'claude.includeCoAuthoredBy': false },
        commands: [['claude', '--version']],
    },
    {
        driver: 'gemini',
        env: (root) => ({ GEMINI_CLI_HOME: join(root, 'gemini') }),
        values: { 'gemini.output.format': 'text', 'gemini.tools.useRipgrep': true },
        commands: [['gemini', '--version']],
    },
    {
        driver: 'pi',
        env: (root) => ({ PI_CODING_AGENT_DIR: join(root, 'pi') }),
        values: { 'pi.quietStartup': true },
        commands: [['pi', '--version']],
    },
    {
        driver: 'copilot',
        env: (root) => ({ COPILOT_HOME: join(root, 'copilot') }),
        values: { 'copilot.theme': 'auto' },
        commands: [
            ['copilot', '--version'],
            ['gh', 'copilot', '--version'],
        ],
    },
]

async function withEnv<T>(patch: NodeJS.ProcessEnv, action: () => Promise<T>): Promise<T> {
    const previous = new Map(Object.keys(patch).map((key) => [key, process.env[key]]))
    Object.assign(process.env, patch)
    try {
        return await action()
    } finally {
        for (const [key, value] of previous) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    }
}

async function findCommand(
    commands: readonly (readonly string[])[],
    commandExists: CommandExists
): Promise<readonly string[] | null> {
    for (const command of commands) {
        if (await commandExists(command[0] ?? '')) return command
    }
    return null
}

async function runSpec(
    root: string,
    spec: AcceptanceSpec,
    runCommand: CommandRunner,
    commandExists: CommandExists,
    readVersion: VersionReader
): Promise<AgentConfigAcceptanceRow> {
    return await withEnv(spec.env(root), async () => {
        const version = await readVersion(spec.driver)
        const commandStart = version.status === 'supported' || version.status === 'unsupported' ? 'passed' : 'skipped'
        const command = version.command
        try {
            if (version.status !== 'supported') {
                try {
                    await saveAgentConfigFile(
                        { driver: spec.driver, values: spec.values, expectedExists: false },
                        { readVersion }
                    )
                    return {
                        driver: spec.driver,
                        configPath: '',
                        supportedVersion: version.supportedVersion,
                        installedVersion: version.installedVersion,
                        versionStatus: version.status,
                        configWrite: 'failed',
                        commandStart,
                        command,
                        message: 'unsupported version was allowed to write',
                    }
                } catch {
                    return {
                        driver: spec.driver,
                        configPath: '',
                        supportedVersion: version.supportedVersion,
                        installedVersion: version.installedVersion,
                        versionStatus: version.status,
                        configWrite: 'blocked',
                        commandStart,
                        command,
                        message: version.installedVersion
                            ? `requires ${version.supportedVersion}`
                            : `missing ${spec.commands.map(commandLabel).join(' or ')}`,
                    }
                }
            }

            const state = await saveAgentConfigFile(
                { driver: spec.driver, values: spec.values, expectedExists: false },
                { readVersion }
            )
            const runnableCommand = await findCommand(spec.commands, commandExists)
            if (!runnableCommand) {
                return {
                    driver: spec.driver,
                    configPath: state.path,
                    supportedVersion: version.supportedVersion,
                    installedVersion: version.installedVersion,
                    versionStatus: version.status,
                    configWrite: 'passed',
                    commandStart: 'skipped',
                }
            }
            const result = await runCommand(runnableCommand, { ...process.env, ...spec.env(root) })
            const missingNestedCommand = result.code !== 0 && /not installed|unknown command/i.test(result.output)
            return {
                driver: spec.driver,
                configPath: state.path,
                supportedVersion: version.supportedVersion,
                installedVersion: version.installedVersion,
                versionStatus: version.status,
                configWrite: 'passed',
                commandStart: result.code === 0 ? 'passed' : missingNestedCommand ? 'skipped' : 'failed',
                command: runnableCommand.join(' '),
                message: result.output.trim().slice(0, 240) || `exit ${result.code}`,
            }
        } catch (error) {
            return {
                driver: spec.driver,
                configPath: '',
                supportedVersion: version.supportedVersion,
                installedVersion: version.installedVersion,
                versionStatus: version.status,
                configWrite: 'failed',
                commandStart: 'skipped',
                message: error instanceof Error ? error.message : String(error),
            }
        }
    })
}

export async function runAgentConfigAcceptance(options: {
    root?: string
    runCommand: CommandRunner
    commandExists: CommandExists
    readVersion?: VersionReader
}): Promise<AgentConfigAcceptanceRow[]> {
    const ownedRoot = options.root ? null : await mkdtemp(join(tmpdir(), 'viby-agent-config-acceptance-'))
    const root = options.root ?? ownedRoot
    if (!root) throw new Error('Acceptance root is required')
    const readVersion = options.readVersion ?? readAgentConfigVersion
    try {
        return await Promise.all(
            ACCEPTANCE_SPECS.map((spec) => runSpec(root, spec, options.runCommand, options.commandExists, readVersion))
        )
    } finally {
        if (ownedRoot) await rm(ownedRoot, { recursive: true, force: true })
    }
}

async function commandExists(command: string): Promise<boolean> {
    if (!command) return false
    const proc = Bun.spawn(['sh', '-lc', `command -v ${command}`], { stdout: 'ignore', stderr: 'ignore' })
    return (await proc.exited) === 0
}

function commandLabel(command: readonly string[]): string {
    return command.join(' ')
}

async function runCommand(cmd: readonly string[], env: NodeJS.ProcessEnv): Promise<CommandResult> {
    const proc = Bun.spawn([...cmd], { env, signal: AbortSignal.timeout(5000), stdout: 'pipe', stderr: 'pipe' })
    const [code, stdout, stderr] = await Promise.all([proc.exited, proc.stdout.text(), proc.stderr.text()])
    return { code, output: `${stdout}${stderr}` }
}

if (import.meta.main) {
    const rows = await runAgentConfigAcceptance({ runCommand, commandExists })
    console.table(rows)
    if (rows.some((row) => row.configWrite === 'failed' || row.commandStart === 'failed')) process.exit(1)
}
