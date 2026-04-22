import type { ModelReasoningEffort, PermissionMode } from '@/types/api'
import type { NewSessionPreferences } from './preferences'
import type { AgentType, ModelReasoningEffortSelection, SessionType } from './types'

export async function submitNewSessionCreation(options: {
    agent: AgentType
    sessionType: SessionType
    worktreeName: string
    model: string
    modelReasoningEffort: ModelReasoningEffortSelection
    yoloMode: boolean
    trimmedDirectory: string
    directoryCreationConfirmed: boolean
    checkPathsExists: (paths: string[]) => Promise<Record<string, boolean>>
    confirmDirectoryCreation: () => void
    spawnSession: (payload: {
        directory: string
        agent: AgentType
        model?: string
        modelReasoningEffort?: ModelReasoningEffort
        permissionMode?: PermissionMode
        sessionType: SessionType
        worktreeName?: string
    }) => Promise<{ type: 'success'; session: { id: string } } | { type: 'error'; message: string }>
    resolvePermissionMode: (agent: AgentType, yoloMode: boolean) => PermissionMode
    buildPreferenceSnapshot: () => NewSessionPreferences
    commitPreferences: (snapshot: NewSessionPreferences) => void
    addRecentPath: (path: string) => void
    notifySuccess: () => void
    onSuccess: (sessionId: string) => void
    onWorktreeMissing: () => void
    onNeedsDirectoryCreation: () => void
    onError: (message: string) => void
}) {
    const existsResult = await options.checkPathsExists([options.trimmedDirectory])
    const directoryExists = existsResult[options.trimmedDirectory]

    if (options.sessionType === 'worktree' && directoryExists === false) {
        options.onWorktreeMissing()
        return
    }

    if (options.sessionType === 'simple' && directoryExists === false && !options.directoryCreationConfirmed) {
        options.confirmDirectoryCreation()
        options.onNeedsDirectoryCreation()
        return
    }

    const resolvedModel = options.model !== 'auto' && options.agent !== 'opencode' ? options.model : undefined
    const resolvedModelReasoningEffort =
        options.modelReasoningEffort !== 'default' ? options.modelReasoningEffort : undefined
    const result = await options.spawnSession({
        directory: options.trimmedDirectory,
        agent: options.agent,
        model: resolvedModel,
        modelReasoningEffort: resolvedModelReasoningEffort,
        permissionMode: options.resolvePermissionMode(options.agent, options.yoloMode),
        sessionType: options.sessionType,
        worktreeName: options.sessionType === 'worktree' ? options.worktreeName.trim() || undefined : undefined,
    })

    if (result.type !== 'success') {
        options.onError(result.message)
        return
    }

    options.commitPreferences(options.buildPreferenceSnapshot())
    options.addRecentPath(options.trimmedDirectory)
    options.notifySuccess()
    options.onSuccess(result.session.id)
}
