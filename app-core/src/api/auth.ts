import { configuration } from '@/configuration'

export function getAuthToken(): string {
    if (!configuration.hubOwnerToken) {
        throw new Error('Hub owner token is missing. Start Viby Desktop so AppCore can initialize local settings.')
    }
    return configuration.hubOwnerToken
}
