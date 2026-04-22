import { CodexCollaborationModeSchema, ModelReasoningEffortSchema, PermissionModeSchema } from '@viby/protocol/schemas'
import type { SessionHandoffSnapshot } from '@viby/protocol/types'
import type { SessionCollaborationMode, SessionModelReasoningEffort, SessionPermissionMode } from '@/api/types'
import { type DriverSwitchTarget, loadDriverSwitchHandoff, parseDriverSwitchTarget } from '@/runner/driverSwitchHandoff'

export type InternalAgentFlavor = 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' | 'pi' | 'copilot'

export type DriverSwitchBootstrap = {
    targetDriver: DriverSwitchTarget
    handoffSnapshot: SessionHandoffSnapshot
}

export type InternalSessionOptions = {
    agent: InternalAgentFlavor
    startedBy: 'runner' | 'terminal'
    vibySessionId?: string
    resumeSessionId?: string
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
    permissionMode?: SessionPermissionMode
    collaborationMode?: SessionCollaborationMode
    driverSwitch?: DriverSwitchBootstrap
}

export type ParsedInternalSessionArgs = Omit<InternalSessionOptions, 'driverSwitch'> & {
    driverSwitchTarget?: DriverSwitchTarget
    driverSwitchHandoffFile?: string
}

function parseAgent(value: string | undefined): InternalAgentFlavor {
    if (
        value === 'claude' ||
        value === 'codex' ||
        value === 'cursor' ||
        value === 'gemini' ||
        value === 'opencode' ||
        value === 'pi' ||
        value === 'copilot'
    ) {
        return value
    }
    throw new Error('Missing or invalid --agent value')
}

function parseStartedBy(value: string | undefined): 'runner' | 'terminal' {
    if (value === 'runner' || value === 'terminal') {
        return value
    }
    throw new Error('Missing or invalid --started-by value')
}

function readFlagValue(args: string[], index: number, flag: string): string {
    const value = args[index + 1]
    if (!value) {
        throw new Error(`Missing ${flag} value`)
    }
    return value
}

export function parseInternalSessionArgs(args: string[]): ParsedInternalSessionArgs {
    let agent: InternalAgentFlavor | null = null
    let startedBy: 'runner' | 'terminal' = 'runner'
    let vibySessionId: string | undefined
    let resumeSessionId: string | undefined
    let model: string | undefined
    let modelReasoningEffort: SessionModelReasoningEffort | undefined
    let permissionMode: SessionPermissionMode | undefined
    let collaborationMode: SessionCollaborationMode | undefined
    let driverSwitchTarget: DriverSwitchTarget | undefined
    let driverSwitchHandoffFile: string | undefined

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]

        if (arg === '--agent') {
            agent = parseAgent(readFlagValue(args, index, '--agent'))
            index += 1
            continue
        }
        if (arg === '--started-by') {
            startedBy = parseStartedBy(readFlagValue(args, index, '--started-by'))
            index += 1
            continue
        }
        if (arg === '--resume-session-id') {
            resumeSessionId = readFlagValue(args, index, '--resume-session-id')
            index += 1
            continue
        }
        if (arg === '--viby-session-id') {
            vibySessionId = readFlagValue(args, index, '--viby-session-id')
            index += 1
            continue
        }
        if (arg === '--model') {
            model = readFlagValue(args, index, '--model')
            index += 1
            continue
        }
        if (arg === '--model-reasoning-effort') {
            const parsed = ModelReasoningEffortSchema.safeParse(readFlagValue(args, index, '--model-reasoning-effort'))
            if (!parsed.success) {
                throw new Error('Invalid --model-reasoning-effort value')
            }
            modelReasoningEffort = parsed.data
            index += 1
            continue
        }
        if (arg === '--permission-mode') {
            const parsed = PermissionModeSchema.safeParse(readFlagValue(args, index, '--permission-mode'))
            if (!parsed.success) {
                throw new Error('Invalid --permission-mode value')
            }
            permissionMode = parsed.data
            index += 1
            continue
        }
        if (arg === '--collaboration-mode') {
            const parsed = CodexCollaborationModeSchema.safeParse(readFlagValue(args, index, '--collaboration-mode'))
            if (!parsed.success) {
                throw new Error('Invalid --collaboration-mode value')
            }
            collaborationMode = parsed.data
            index += 1
            continue
        }
        if (arg === '--driver-switch-target') {
            driverSwitchTarget = parseDriverSwitchTarget(readFlagValue(args, index, '--driver-switch-target'))
            index += 1
            continue
        }
        if (arg === '--driver-switch-handoff-file') {
            driverSwitchHandoffFile = readFlagValue(args, index, '--driver-switch-handoff-file')
            index += 1
            continue
        }

        throw new Error(`Unknown internal session argument: ${arg}`)
    }

    if (!agent) {
        throw new Error('Missing --agent value')
    }

    return {
        agent,
        startedBy,
        vibySessionId,
        resumeSessionId,
        model,
        modelReasoningEffort,
        permissionMode,
        collaborationMode,
        driverSwitchTarget,
        driverSwitchHandoffFile,
    }
}

async function resolveDriverSwitchBootstrap(
    options: ParsedInternalSessionArgs
): Promise<DriverSwitchBootstrap | undefined> {
    if (options.driverSwitchTarget === undefined && options.driverSwitchHandoffFile === undefined) {
        return undefined
    }
    if (options.driverSwitchTarget === undefined) {
        throw new Error('Missing --driver-switch-target value')
    }
    if (options.driverSwitchHandoffFile === undefined) {
        throw new Error('Missing --driver-switch-handoff-file value')
    }

    return await loadDriverSwitchHandoff({
        targetDriver: options.driverSwitchTarget,
        handoffFilePath: options.driverSwitchHandoffFile,
        expectedAgent: options.agent,
    })
}

export async function resolveInternalSessionOptions(args: string[]): Promise<InternalSessionOptions> {
    const parsed = parseInternalSessionArgs(args)
    return {
        agent: parsed.agent,
        startedBy: parsed.startedBy,
        vibySessionId: parsed.vibySessionId,
        resumeSessionId: parsed.resumeSessionId,
        model: parsed.model,
        modelReasoningEffort: parsed.modelReasoningEffort,
        permissionMode: parsed.permissionMode,
        collaborationMode: parsed.collaborationMode,
        driverSwitch: await resolveDriverSwitchBootstrap(parsed),
    }
}
