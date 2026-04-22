import { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { logger } from '@/lib'
import { runDetachedTask } from '@/utils/runDetachedTask'

interface KillSessionRequest {
    // No parameters needed
}

interface KillSessionResponse {
    success: boolean
    message: string
}

export function registerKillSessionHandler(rpcHandlerManager: RpcHandlerManager, requestShutdown: () => Promise<void>) {
    rpcHandlerManager.registerHandler<KillSessionRequest, KillSessionResponse>('killSession', async () => {
        logger.debug('Kill session request received')

        // Respond immediately while the runtime stop owner shuts the session down.
        runDetachedTask(requestShutdown, 'Kill session cleanup failed')

        return {
            success: true,
            message: 'Killing viby CLI process',
        }
    })
}
