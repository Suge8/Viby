import { useCallback, useState } from 'react'
import { readBrowserStorageItem, writeBrowserStorageItem } from '@/lib/browserStorage'
import { LOCAL_STORAGE_KEYS } from '@/lib/storage/storageRegistry'

export const COMPOSER_ENTER_BEHAVIORS = ['enter-to-send', 'modifier-enter-to-send'] as const
export type ComposerEnterBehavior = (typeof COMPOSER_ENTER_BEHAVIORS)[number]

const DEFAULT_COMPOSER_ENTER_BEHAVIOR: ComposerEnterBehavior = 'enter-to-send'

export function normalizeComposerEnterBehavior(value: string | null | undefined): ComposerEnterBehavior {
    return value === 'modifier-enter-to-send' ? 'modifier-enter-to-send' : DEFAULT_COMPOSER_ENTER_BEHAVIOR
}

export function readComposerEnterBehavior(): ComposerEnterBehavior {
    return normalizeComposerEnterBehavior(readBrowserStorageItem('local', LOCAL_STORAGE_KEYS.composerEnterBehavior))
}

export function writeComposerEnterBehavior(value: ComposerEnterBehavior): void {
    writeBrowserStorageItem('local', LOCAL_STORAGE_KEYS.composerEnterBehavior, value)
}

export function useComposerEnterBehaviorPreference(): readonly [
    ComposerEnterBehavior,
    (value: ComposerEnterBehavior) => void,
] {
    const [enterBehavior, setEnterBehavior] = useState<ComposerEnterBehavior>(() => readComposerEnterBehavior())
    const updateEnterBehavior = useCallback((value: ComposerEnterBehavior) => {
        setEnterBehavior(value)
        writeComposerEnterBehavior(value)
    }, [])

    return [enterBehavior, updateEnterBehavior] as const
}
