import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import { CodexRemoteCoordinator } from './codexRemoteCoordinator'
import type { CodexSession } from './session'
import { hasCodexCliOverrides } from './utils/codexCliOverrides'

class CodexRemoteLauncher extends RemoteLauncherBase {
    private readonly session: CodexSession
    private readonly coordinator: CodexRemoteCoordinator

    constructor(session: CodexSession) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.coordinator = new CodexRemoteCoordinator(session, session.getAppServerClient(), this.messageBuffer)
        this.session.setRuntimeStopHandler(() => this.requestStop())
    }

    private async handleAbort(): Promise<void> {
        await this.coordinator.handleAbort()
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        if (this.session.codexArgs && this.session.codexArgs.length > 0) {
            if (hasCodexCliOverrides(this.session.codexCliOverrides)) {
                logger.debug(
                    '[codex-remote] CLI args include sandbox/approval overrides; other args are ignored in remote mode.'
                )
            } else {
                logger.debug(
                    `[codex-remote] Warning: CLI args [${this.session.codexArgs.join(', ')}] are ignored in remote mode. ` +
                        `Remote mode uses message-based configuration (model/sandbox set via web interface).`
                )
            }
        }

        return this.start()
    }

    protected async abortForStop(): Promise<void> {
        await this.handleAbort()
    }

    protected async runMainLoop(): Promise<void> {
        this.setupAbortHandlers(this.session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
        })
        await this.coordinator.runMainLoop(() => this.shouldExit)
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.session.setRuntimeStopHandler(null)
        await this.coordinator.cleanup()
    }
}

export async function codexRemoteLauncher(session: CodexSession): Promise<RemoteLauncherExitReason> {
    return await new CodexRemoteLauncher(session).launch()
}
