/**
 * Runtime holder for the `publicAccessEnabled` policy.
 *
 * `settings.toml` is the single source of truth. The desktop shell writes the
 * file; the Hub watches it and hot-reloads the policy without a process
 * restart. When the value was locked by an explicit `VIBY_PUBLIC_ACCESS_ENABLED`
 * environment variable, the watcher stays off so headless overrides keep
 * priority.
 */

import { type FSWatcher, watch } from 'node:fs'
import { basename, dirname } from 'node:path'
import { readSettings } from '../config/settings'
import { reportHubRuntimeError } from './runtimeDiagnostics'

export interface PublicAccessRuntime {
    isEnabled(): boolean
    dispose(): void
}

export interface PublicAccessRuntimeOptions {
    initialEnabled: boolean
    settingsFile: string
    /** True when the value came from env and must not be hot-reloaded. */
    locked: boolean
    /** Called only when the persisted value actually changes. */
    onChange(enabled: boolean): void
}

export function createPublicAccessRuntime(options: PublicAccessRuntimeOptions): PublicAccessRuntime {
    let current = options.initialEnabled
    let watcher: FSWatcher | null = null

    async function reloadFromSettings(): Promise<void> {
        const settings = await readSettings(options.settingsFile)
        if (settings === null) {
            return
        }
        const next = settings.publicAccessEnabled
        if (next === undefined || next === current) {
            return
        }
        current = next
        options.onChange(next)
    }

    if (!options.locked) {
        const settingsFileName = basename(options.settingsFile)
        watcher = watch(dirname(options.settingsFile), (_event, changedName) => {
            if (changedName === settingsFileName) {
                reloadFromSettings().catch((error) => {
                    reportHubRuntimeError('Failed to hot-reload public access settings.', error)
                })
            }
        })
    }

    return {
        isEnabled: () => current,
        dispose: () => {
            watcher?.close()
            watcher = null
        },
    }
}
