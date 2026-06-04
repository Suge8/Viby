import { AgentAvailabilityResponseSchema } from '@viby/protocol'
import { listAgentAvailability } from '@/agent/agentAvailability'
import { runVibyMcpStdioBridge } from '@/codex/vibyMcpStdioBridge'
import { isBunCompiled } from '@/projectPath'
import { ensureRuntimeAssets } from '@/runtime/assets'
import { getRuntimeArgs } from '@/utils/runtimeArgs'
import { parseInternalAgentAvailabilityArgs } from './commands/internalAgentAvailability'
import { resolveInternalSessionOptions } from './commands/internalSessionArgs'
import { INTERNAL_SESSION_COMMAND } from './commands/internalSessionContract'
import { runInternalSessionRuntime } from './commands/internalSessionRuntime'

type InternalCommand = {
    requiresRuntimeAssets: boolean
    run(args: string[]): Promise<void>
}

export const APP_CORE_INTERNAL_ENV = 'VIBY_APP_CORE_INTERNAL'
const INTERNAL_AGENT_AVAILABILITY_COMMAND = '__internal_agent_availability'

const commands = new Map<string, InternalCommand>([
    ['mcp', { requiresRuntimeAssets: false, run: runVibyMcpStdioBridge }],
    ['hook-forwarder', { requiresRuntimeAssets: false, run: runHookForwarder }],
    [INTERNAL_AGENT_AVAILABILITY_COMMAND, { requiresRuntimeAssets: false, run: runAgentAvailability }],
    [INTERNAL_SESSION_COMMAND, { requiresRuntimeAssets: true, run: runSessionCommand }],
])

function rejectInternalRuntimeAccess(): never {
    process.stderr.write('Viby internal runtime is only available through Desktop AppCore.\n')
    process.exit(64)
}

function assertInternalRuntimeAccess(): void {
    if (process.env[APP_CORE_INTERNAL_ENV] !== '1') {
        rejectInternalRuntimeAccess()
    }
}

function rejectUnsupportedCommand(command: string | undefined): never {
    const label = command ?? '(missing)'
    process.stderr.write(`Unsupported AppCore internal command: ${label}\n`)
    process.exit(64)
}

async function runHookForwarder(args: string[]): Promise<void> {
    const { runSessionHookForwarder } = await import('@/claude/utils/sessionHookForwarder')
    await runSessionHookForwarder(args)
}

async function runAgentAvailability(args: string[]): Promise<void> {
    const request = parseInternalAgentAvailabilityArgs(args)
    const response = AgentAvailabilityResponseSchema.parse(await listAgentAvailability(request))
    process.stdout.write(`${JSON.stringify(response)}\n`)
}

async function runSessionCommand(args: string[]): Promise<void> {
    const options = await resolveInternalSessionOptions(args)
    if (options.startedBy !== 'app-core') {
        rejectUnsupportedCommand(`${INTERNAL_SESSION_COMMAND} --started-by ${options.startedBy}`)
    }
    await runInternalSessionRuntime(options)
}

export async function runInternalRuntimeCommand(rawArgs = getRuntimeArgs()): Promise<void> {
    assertInternalRuntimeAccess()

    if (isBunCompiled()) {
        process.env.DEV = 'false'
    }

    const [commandName, ...commandArgs] = rawArgs
    const command = commandName ? commands.get(commandName) : undefined
    if (!command) {
        rejectUnsupportedCommand(commandName)
    }

    if (command.requiresRuntimeAssets) {
        await ensureRuntimeAssets()
    }

    await command.run(commandArgs)
}

if (import.meta.main) {
    runInternalRuntimeCommand().catch((error) => {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
        process.stderr.write(`${message}\n`)
        process.exit(1)
    })
}
