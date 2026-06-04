import { randomUUID } from 'node:crypto'
import { configuration } from '@/configuration'
import { updateSettings } from '@/persistence'

export async function authAndSetupMachineIfNeeded(): Promise<{
    token: string
    machineId: string
}> {
    if (!configuration.hubOwnerToken) {
        throw new Error('Hub owner token is missing. Start Viby Desktop so AppCore can initialize local settings.')
    }

    const settings = await updateSettings((current) => {
        if (!current.machineId) {
            return {
                ...current,
                machineId: randomUUID(),
            }
        }
        return current
    })

    if (!settings.machineId) {
        throw new Error('Failed to initialize machineId')
    }

    return { token: configuration.hubOwnerToken, machineId: settings.machineId }
}
