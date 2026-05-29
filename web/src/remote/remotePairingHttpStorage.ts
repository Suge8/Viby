import { hasPairingWorkspaceIntent, PAIRING_PWA_HANDOFF_PARAM } from '@viby/protocol'
import {
    readBrowserStorageItem,
    readBrowserStorageItemOrThrow,
    removeBrowserStorageItem,
    writeBrowserStorageItem,
} from '@/lib/browserStorage'
import { getPairingGuestTokenStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

export function readRemotePairingId(pathname: string, search = ''): string | null {
    return (
        readRemotePairingPathId(pathname) ??
        (hasPairingWorkspaceIntent(pathname, search) ? readStoredRemotePairingId() : null)
    )
}

export function readRemotePairingPathId(pathname: string): string | null {
    const match = /^\/p\/([^/?#]+)$/.exec(pathname)
    if (match?.[1]) {
        return decodeURIComponent(match[1])
    }
    return null
}

export function readStoredRemotePairingId(): string | null {
    return readBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)
}

export function rememberRemotePairingId(pairingId: string): void {
    writeBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing, pairingId)
}

export function clearRemotePairingId(): void {
    removeBrowserStorageItem('local', LOCAL_STORAGE_KEYS.remoteActivePairing)
}

function getHashParam(key: string): string | null {
    return new URLSearchParams(window.location.hash.slice(1)).get(key)
}

function getSearchParam(key: string): string | null {
    return new URLSearchParams(window.location.search).get(key)
}

export function getPairingHandoffTicketFromLocation(): string | null {
    return getSearchParam(PAIRING_PWA_HANDOFF_PARAM) ?? getHashParam(PAIRING_PWA_HANDOFF_PARAM)
}

export function scrubPairingLaunchSecretFromUrl(): void {
    const searchParams = new URLSearchParams(window.location.search)
    searchParams.delete(PAIRING_PWA_HANDOFF_PARAM)
    const nextSearch = searchParams.toString()
    const url = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`
    window.history.replaceState({}, '', url)
}

export function getPairingTokenKey(pairingId: string): string {
    return getPairingGuestTokenStorageKey(pairingId)
}

export function readStoredGuestToken(pairingId: string): string | null {
    return readBrowserStorageItemOrThrow('local', getPairingGuestTokenStorageKey(pairingId))
}

export function storeGuestToken(pairingId: string, token: string): void {
    writeBrowserStorageItem('local', getPairingGuestTokenStorageKey(pairingId), token)
}

export function clearStoredGuestToken(pairingId: string): void {
    removeBrowserStorageItem('local', getPairingGuestTokenStorageKey(pairingId))
}
