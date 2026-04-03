import { INTERNAL_SESSION_COMMAND } from '@/commands/internalSessionContract'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'

import { RUNNER_MANAGED_STARTED_BY } from './types'
import type { DriverSwitchHandoffTransport } from './driverSwitchHandoff'

type InternalSessionArgBuilderOptions = Pick<
    SpawnSessionOptions,
    'resumeSessionId'
    | 'permissionMode'
    | 'sessionRole'
    | 'model'
    | 'modelReasoningEffort'
    | 'collaborationMode'
> & {
    sessionId?: string
    driverSwitchTransport?: DriverSwitchHandoffTransport | null
}

export function buildInternalSessionArgs(
    agent: SpawnSessionOptions['agent'],
    options: InternalSessionArgBuilderOptions
): string[] {
    const resolvedAgent = agent ?? 'claude'
    const args = [
        INTERNAL_SESSION_COMMAND,
        '--agent',
        resolvedAgent,
        '--starting-mode',
        'remote',
        '--started-by',
        RUNNER_MANAGED_STARTED_BY
    ]

    if (options.resumeSessionId) {
        args.push('--resume-session-id', options.resumeSessionId)
    }
    if (options.sessionId) {
        args.push('--viby-session-id', options.sessionId)
    }
    if (options.permissionMode) {
        args.push('--permission-mode', options.permissionMode)
    }
    if (options.sessionRole) {
        args.push('--session-role', options.sessionRole)
    }
    if (options.model && resolvedAgent !== 'opencode') {
        args.push('--model', options.model)
    }
    if (options.modelReasoningEffort && (resolvedAgent === 'codex' || resolvedAgent === 'claude' || resolvedAgent === 'pi')) {
        args.push('--model-reasoning-effort', options.modelReasoningEffort)
    }
    if (options.collaborationMode && resolvedAgent === 'codex') {
        args.push('--collaboration-mode', options.collaborationMode)
    }
    if (options.driverSwitchTransport) {
        args.push('--driver-switch-target', options.driverSwitchTransport.targetDriver)
        args.push('--driver-switch-handoff-file', options.driverSwitchTransport.handoffFilePath)
    }

    return args
}
