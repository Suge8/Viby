import {
    type AgentConfigDriver,
    type AgentConfigVersionState,
    getAgentConfigSupportedVersion,
    isAgentConfigVersionSupported,
    normalizeAgentConfigVersion,
    parseAgentConfigVersionOutput,
} from '@viby/protocol/agentConfig'

// Version checks are advisory only. We never block writes — schemas are stable across recent
// CLI patch versions, and forcing users to upgrade just to tweak a setting is hostile.

type CommandResult = { code: number; output: string }
type CommandExecutor = (command: readonly string[]) => Promise<CommandResult>

const VERSION_COMMANDS: Record<AgentConfigDriver, readonly (readonly string[])[]> = {
    codex: [['codex', '--version']],
    claude: [['claude', '--version']],
    gemini: [['gemini', '--version']],
    pi: [['pi', '--version']],
    copilot: [
        ['copilot', '--version'],
        ['gh', 'copilot', '--version'],
    ],
}

function commandLabel(command: readonly string[]): string {
    return command.join(' ')
}

function versionState(
    driver: AgentConfigDriver,
    status: AgentConfigVersionState['status'],
    options: { command?: readonly string[]; installedVersion?: string } = {}
): AgentConfigVersionState {
    const requirement = getAgentConfigSupportedVersion(driver)
    return {
        status,
        supportedVersion: requirement.version,
        source: requirement.source,
        installedVersion: options.installedVersion,
        command: options.command ? commandLabel(options.command) : undefined,
        checkedAt: Date.now(),
    }
}

async function runCommand(command: readonly string[]): Promise<CommandResult> {
    try {
        const proc = Bun.spawn([...command], { signal: AbortSignal.timeout(5000), stdout: 'pipe', stderr: 'pipe' })
        const [code, stdout, stderr] = await Promise.all([proc.exited, proc.stdout.text(), proc.stderr.text()])
        return { code, output: `${stdout}${stderr}` }
    } catch (error) {
        if (error instanceof Error && /ENOENT|Executable not found/i.test(error.message)) {
            return { code: 127, output: error.message }
        }
        throw error
    }
}

export async function readAgentConfigVersion(
    driver: AgentConfigDriver,
    executeCommand: CommandExecutor = runCommand
): Promise<AgentConfigVersionState> {
    let sawCommand = false
    for (const command of VERSION_COMMANDS[driver]) {
        const result = await executeCommand(command)
        if (result.code === 127 || /command not found|not installed|unknown command/i.test(result.output)) continue
        sawCommand = true
        if (result.code !== 0) continue
        const installedVersion = parseAgentConfigVersionOutput(result.output)
        if (!installedVersion) return versionState(driver, 'unknown', { command })
        return versionState(
            driver,
            isAgentConfigVersionSupported(driver, installedVersion) ? 'supported' : 'outdated',
            {
                command,
                installedVersion: normalizeAgentConfigVersion(installedVersion),
            }
        )
    }
    return versionState(driver, sawCommand ? 'unknown' : 'missing')
}
