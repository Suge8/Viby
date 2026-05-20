import { configuration } from '@/configuration'

export function getAuthToken(): string {
    if (!configuration.hubOwnerToken) {
        throw new Error('Hub owner token is missing. Run `viby auth login` for headless CLI access.')
    }
    return configuration.hubOwnerToken
}
