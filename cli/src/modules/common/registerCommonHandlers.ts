import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { registerBashHandlers } from './handlers/bash'
import { registerCommandCapabilitiesHandlers } from './handlers/commandCapabilities'
import { registerDifftasticHandlers } from './handlers/difftastic'
import { registerDirectoryHandlers } from './handlers/directories'
import { registerFileHandlers } from './handlers/files'
import { registerGitHandlers } from './handlers/git'
import { registerRipgrepHandlers } from './handlers/ripgrep'
import { registerUploadHandlers } from './handlers/uploads'
import { toWorkingDirectoryProvider, type WorkingDirectoryProvider } from './workingDirectory'

export function registerCommonHandlers(
    rpcHandlerManager: RpcHandlerManager,
    workingDirectory: string | WorkingDirectoryProvider,
    options?: {
        onCommandCapabilitiesInvalidated?: () => void
    }
): void {
    const getWorkingDirectory = toWorkingDirectoryProvider(workingDirectory)
    registerCommandCapabilitiesHandlers(rpcHandlerManager, getWorkingDirectory, {
        onInvalidate: options?.onCommandCapabilitiesInvalidated,
    })
    registerBashHandlers(rpcHandlerManager, getWorkingDirectory)
    registerFileHandlers(rpcHandlerManager, getWorkingDirectory)
    registerDirectoryHandlers(rpcHandlerManager, getWorkingDirectory)
    registerRipgrepHandlers(rpcHandlerManager, getWorkingDirectory)
    registerDifftasticHandlers(rpcHandlerManager, getWorkingDirectory)
    registerGitHandlers(rpcHandlerManager, getWorkingDirectory)
    registerUploadHandlers(rpcHandlerManager)
}
