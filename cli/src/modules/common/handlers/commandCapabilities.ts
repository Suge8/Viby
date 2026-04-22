import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { logger } from '@/ui/logger'
import {
    getCommandCapabilitySnapshot,
    type ListCommandCapabilitiesRequest,
    type ListCommandCapabilitiesResponse,
} from '../commandCapabilities'
import { getErrorMessage, rpcError } from '../rpcResponses'
import type { WorkingDirectoryProvider } from '../workingDirectory'

export function registerCommandCapabilitiesHandlers(
    rpcHandlerManager: RpcHandlerManager,
    getWorkingDirectory: WorkingDirectoryProvider,
    options?: {
        onInvalidate?: () => void
    }
): void {
    rpcHandlerManager.registerHandler<ListCommandCapabilitiesRequest, ListCommandCapabilitiesResponse>(
        'listCommandCapabilities',
        async (data) => {
            logger.debug('List command capabilities request for agent:', data.agent)

            try {
                const snapshot = await getCommandCapabilitySnapshot(data.agent, getWorkingDirectory(), {
                    onInvalidate: options?.onInvalidate,
                })
                if (data.revision && data.revision === snapshot.revision) {
                    return { success: true, revision: snapshot.revision, notModified: true }
                }
                return {
                    success: true,
                    revision: snapshot.revision,
                    capabilities: snapshot.capabilities,
                }
            } catch (error) {
                logger.debug('Failed to list command capabilities:', error)
                return rpcError(getErrorMessage(error, 'Failed to list command capabilities'))
            }
        }
    )
}
