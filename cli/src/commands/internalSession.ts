import { authAndSetupMachineIfNeeded } from '@/ui/auth'
import { initializeToken } from '@/ui/tokenInit'
import { parseInternalSessionArgs, resolveInternalSessionOptions } from './internalSessionArgs'
import { INTERNAL_SESSION_COMMAND } from './internalSessionContract'
import { runInternalSession } from './internalSessionRunner'
import type { CommandDefinition } from './types'

async function prepareInternalSessionStart(startedBy: 'runner' | 'terminal'): Promise<void> {
    if (startedBy === 'runner') {
        return
    }

    await initializeToken()
    await authAndSetupMachineIfNeeded()
}

export { parseInternalSessionArgs, resolveInternalSessionOptions } from './internalSessionArgs'

export const internalSessionCommand: CommandDefinition = {
    name: INTERNAL_SESSION_COMMAND,
    requiresRuntimeAssets: true,
    run: async ({ commandArgs }) => {
        const options = await resolveInternalSessionOptions(commandArgs)
        await prepareInternalSessionStart(options.startedBy)
        await runInternalSession(options)
    },
}
