import type { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/rpcTypes'
import { logger } from '@/ui/logger'
import type { DriverSwitchHandoffTransport } from './driverSwitchHandoff'
import { buildSpawnEnvironment, createDriverSwitchTransport } from './runnerSpawnEnvironment'
import { buildSpawnArgs, spawnChildProcess } from './runnerSpawnProcess'
import { prepareSpawnWorkspace } from './runnerSpawnWorkspace'
import type { TrackedSession } from './types'

type SpawnFailureDetails = {
    message: string
    pid?: number
    exitCode?: number | null
    signal?: NodeJS.Signals | null
}

type SpawnOutcome = { type: 'success' } | { type: 'error'; details: SpawnFailureDetails }

type CreateSpawnSessionHandlerOptions = {
    pidToTrackedSession: Map<number, TrackedSession>
    pidToAwaiter: Map<number, (session: TrackedSession) => void>
    pidToErrorAwaiter: Map<number, (errorMessage: string) => void>
    onChildExited: (pid: number) => void
    reportSpawnOutcome: (outcome: SpawnOutcome) => void
}

export function createSpawnSessionHandler({
    pidToTrackedSession,
    pidToAwaiter,
    pidToErrorAwaiter,
    onChildExited,
    reportSpawnOutcome,
}: CreateSpawnSessionHandlerOptions) {
    return async function spawnSession(options: SpawnSessionOptions): Promise<SpawnSessionResult> {
        logger.debugLargeJson('[RUNNER RUN] Spawning session', options)

        const workspaceResult = await prepareSpawnWorkspace({
            directory: options.directory,
            sessionType: options.sessionType ?? 'simple',
            approvedNewDirectoryCreation: options.approvedNewDirectoryCreation ?? true,
            worktreeName: options.worktreeName,
        })
        if (!workspaceResult.ok) {
            return workspaceResult.result
        }

        let driverSwitchTransport: DriverSwitchHandoffTransport | null = null
        const cleanupDriverSwitchTransport = async () => {
            if (!driverSwitchTransport) {
                return
            }

            const transport = driverSwitchTransport
            driverSwitchTransport = null
            await transport.cleanup()
        }

        try {
            const extraEnv = await buildSpawnEnvironment(options, workspaceResult.workspace.worktreeInfo)

            if (options.driverSwitch) {
                try {
                    driverSwitchTransport = await createDriverSwitchTransport(options)
                } catch (error) {
                    const errorMessage = `Driver switch transport failed: ${error instanceof Error ? error.message : String(error)}`
                    reportSpawnOutcome({
                        type: 'error',
                        details: { message: errorMessage },
                    })
                    await workspaceResult.workspace.maybeCleanupWorktree('driver-switch-transport-error')
                    return { type: 'error', errorMessage }
                }
            }

            const args = buildSpawnArgs(options.agent ?? 'claude', {
                resumeSessionId: options.resumeSessionId,
                sessionId: options.sessionId,
                permissionMode: options.permissionMode,
                model: options.model,
                modelReasoningEffort: options.modelReasoningEffort,
                collaborationMode: options.collaborationMode,
                driverSwitchTransport,
            })

            return await spawnChildProcess({
                args,
                cwd: workspaceResult.workspace.spawnDirectory,
                env: extraEnv,
                directory: options.directory,
                directoryCreated: workspaceResult.workspace.directoryCreated,
                cleanupDriverSwitchTransport,
                maybeCleanupWorktree: workspaceResult.workspace.maybeCleanupWorktree,
                pidToTrackedSession,
                pidToAwaiter,
                pidToErrorAwaiter,
                onChildExited,
                reportSpawnOutcome,
            })
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            await cleanupDriverSwitchTransport().catch((cleanupError) => {
                logger.debug('[RUNNER RUN] Failed to cleanup driver switch handoff after spawn exception', cleanupError)
            })
            await workspaceResult.workspace.maybeCleanupWorktree('exception')
            reportSpawnOutcome({
                type: 'error',
                details: {
                    message: `Failed to spawn session: ${errorMessage}`,
                },
            })
            return {
                type: 'error',
                errorMessage: `Failed to spawn session: ${errorMessage}`,
            }
        }
    }
}
