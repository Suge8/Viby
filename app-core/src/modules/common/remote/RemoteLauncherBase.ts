import { MessageBuffer } from '@/ui/ink/messageBuffer'

export type RemoteLauncherExitReason = 'exit'
export type RemoteLauncherControl = {
    requestStop: () => Promise<void>
}

export type RemoteLauncherAbortHandlers = {
    onAbort: () => void | Promise<void>
}

type RpcHandlerManagerLike = {
    registerHandler<TRequest = unknown, TResponse = unknown>(
        method: string,
        handler: (params: TRequest) => Promise<TResponse> | TResponse
    ): void
}

export abstract class RemoteLauncherBase {
    protected readonly messageBuffer: MessageBuffer
    protected readonly logPath?: string
    protected exitReason: RemoteLauncherExitReason | null = null
    protected shouldExit: boolean = false
    private stopInFlight: Promise<void> | null = null

    protected constructor(logPath?: string) {
        this.logPath = logPath
        this.messageBuffer = new MessageBuffer()
    }

    protected abstract runMainLoop(): Promise<void>

    protected abstract cleanup(): Promise<void>

    protected abstract abortForStop(): Promise<void>

    protected setupAbortHandlers(
        rpcHandlerManager: RpcHandlerManagerLike,
        handlers: RemoteLauncherAbortHandlers
    ): void {
        rpcHandlerManager.registerHandler('abort', async () => {
            await handlers.onAbort()
        })
    }

    protected clearAbortHandlers(rpcHandlerManager: RpcHandlerManagerLike): void {
        rpcHandlerManager.registerHandler('abort', async () => {})
    }

    protected finalize(): void {
        this.messageBuffer.clear()
    }

    public async requestStop(): Promise<void> {
        if (this.stopInFlight) {
            await this.stopInFlight
            return
        }

        this.shouldExit = true
        this.exitReason = 'exit'
        const stopPromise = this.abortForStop().finally(() => {
            if (this.stopInFlight === stopPromise) {
                this.stopInFlight = null
            }
        })
        this.stopInFlight = stopPromise
        await stopPromise
    }

    protected async start(): Promise<RemoteLauncherExitReason> {
        try {
            await this.runMainLoop()
        } finally {
            await this.cleanup()
            this.finalize()
        }

        return this.exitReason || 'exit'
    }
}
