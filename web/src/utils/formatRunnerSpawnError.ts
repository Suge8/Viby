import type { LocalRuntime } from '../types/api'

export function formatRunnerSpawnError(runtime: LocalRuntime | null): string | null {
    const lastSpawnError = runtime?.runnerState?.lastSpawnError
    if (!lastSpawnError?.message) {
        return null
    }

    const at = typeof lastSpawnError.at === 'number' ? new Date(lastSpawnError.at).toLocaleString() : null
    return at ? `${lastSpawnError.message} (${at})` : lastSpawnError.message
}
