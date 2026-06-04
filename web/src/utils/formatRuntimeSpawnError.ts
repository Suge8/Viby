import type { LocalRuntime } from '../types/api'

export function formatRuntimeSpawnError(runtime: LocalRuntime | null): string | null {
    const lastSpawnError = runtime?.runtimeState?.lastSpawnError
    if (!lastSpawnError?.message) {
        return null
    }

    const at = typeof lastSpawnError.at === 'number' ? new Date(lastSpawnError.at).toLocaleString() : null
    return at ? `${lastSpawnError.message} (${at})` : lastSpawnError.message
}
