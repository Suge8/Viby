const AUTO_UPDATE_CHECK_STORAGE_KEY = 'viby-desktop-auto-update-check'

export function readAutoUpdateCheckEnabled(): boolean {
    if (typeof window === 'undefined') {
        return true
    }

    return window.localStorage.getItem(AUTO_UPDATE_CHECK_STORAGE_KEY) !== 'false'
}

export function writeAutoUpdateCheckEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') {
        return
    }

    window.localStorage.setItem(AUTO_UPDATE_CHECK_STORAGE_KEY, enabled ? 'true' : 'false')
}
