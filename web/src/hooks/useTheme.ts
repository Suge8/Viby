import { useEffect, useState, useSyncExternalStore } from 'react'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { type BrowserLocalStorageKey, LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

type ColorScheme = 'light' | 'dark'

export type AppearancePreference = 'system' | 'dark' | 'light'

const APPEARANCE_KEY = LOCAL_STORAGE_KEYS.appearance

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeGetItem(key: BrowserLocalStorageKey): string | null {
    if (!isBrowser()) {
        return null
    }
    return readBrowserStorageItem('local', key)
}

function safeSetItem(key: BrowserLocalStorageKey, value: string): void {
    if (!isBrowser()) {
        return
    }
    writeBrowserStorageItem('local', key, value)
}

function safeRemoveItem(key: BrowserLocalStorageKey): void {
    if (!isBrowser()) {
        return
    }
    removeBrowserStorageItem('local', key)
}

function parseAppearance(raw: string | null): AppearancePreference {
    if (raw === 'dark' || raw === 'light') {
        return raw
    }
    return 'system'
}

function getStoredAppearance(): AppearancePreference {
    return parseAppearance(safeGetItem(APPEARANCE_KEY))
}

export function getAppearanceOptions(): ReadonlyArray<{ value: AppearancePreference; labelKey: string }> {
    return [
        { value: 'system', labelKey: 'settings.display.appearance.system' },
        { value: 'dark', labelKey: 'settings.display.appearance.dark' },
        { value: 'light', labelKey: 'settings.display.appearance.light' },
    ]
}

function getColorScheme(): ColorScheme {
    const pref = getStoredAppearance()
    if (pref === 'dark' || pref === 'light') {
        return pref
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }

    return 'light'
}

function applyTheme(scheme: ColorScheme): void {
    document.documentElement.setAttribute('data-theme', scheme)
}

let currentScheme: ColorScheme = getColorScheme()
const listeners = new Set<() => void>()
let listenersInitialized = false

applyTheme(currentScheme)

function subscribe(callback: () => void): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
}

function getSnapshot(): ColorScheme {
    return currentScheme
}

function updateScheme(): void {
    const nextScheme = getColorScheme()
    if (nextScheme === currentScheme) {
        return
    }
    currentScheme = nextScheme
    applyTheme(nextScheme)
    listeners.forEach((listener) => listener())
}

export function useTheme(): { colorScheme: ColorScheme; isDark: boolean } {
    const colorScheme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return {
        colorScheme,
        isDark: colorScheme === 'dark',
    }
}

export function useAppearance(): {
    appearance: AppearancePreference
    setAppearance: (pref: AppearancePreference) => void
} {
    const [appearance, setAppearanceState] = useState<AppearancePreference>(getStoredAppearance)

    useEffect(() => {
        if (!isBrowser()) {
            return
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key !== APPEARANCE_KEY) {
                return
            }
            setAppearanceState(parseAppearance(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    function setAppearance(pref: AppearancePreference): void {
        setAppearanceState(pref)

        if (pref === 'system') {
            safeRemoveItem(APPEARANCE_KEY)
        } else {
            safeSetItem(APPEARANCE_KEY, pref)
        }

        updateScheme()
    }

    return {
        appearance,
        setAppearance,
    }
}

export function initializeTheme(): void {
    currentScheme = getColorScheme()
    applyTheme(currentScheme)

    if (listenersInitialized) {
        return
    }

    listenersInitialized = true
    if (typeof window !== 'undefined' && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaQuery.addEventListener('change', updateScheme)
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('storage', (event: StorageEvent) => {
            if (event.key === APPEARANCE_KEY) {
                updateScheme()
            }
        })
    }
}
