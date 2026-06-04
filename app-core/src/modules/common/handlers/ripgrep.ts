import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { run as runRipgrep } from '@/modules/ripgrep/index'
import { logger } from '@/ui/logger'
import { validatePath } from '../pathSecurity'
import { getErrorMessage, rpcError } from '../rpcResponses'
import type { WorkingDirectoryProvider } from '../workingDirectory'

interface RipgrepRequest {
    args: string[]
    cwd?: string
}

interface RipgrepResponse {
    success: boolean
    exitCode?: number
    stdout?: string
    stderr?: string
    error?: string
}

export function registerRipgrepHandlers(
    rpcHandlerManager: RpcHandlerManager,
    getWorkingDirectory: WorkingDirectoryProvider
): void {
    rpcHandlerManager.registerHandler<RipgrepRequest, RipgrepResponse>('ripgrep', async (data) => {
        logger.debug('Ripgrep request with args:', data.args, 'cwd:', data.cwd)
        const workingDirectory = getWorkingDirectory()

        if (data.cwd) {
            const validation = validatePath(data.cwd, workingDirectory)
            if (!validation.valid) {
                return rpcError(validation.error ?? 'Invalid working directory')
            }
        }

        try {
            const result = await runRipgrep(data.args, { cwd: data.cwd })
            return {
                success: true,
                exitCode: result.exitCode,
                stdout: result.stdout.toString(),
                stderr: result.stderr.toString(),
            }
        } catch (error) {
            logger.debug('Failed to run ripgrep:', error)
            return rpcError(getErrorMessage(error, 'Failed to run ripgrep'))
        }
    })
}
