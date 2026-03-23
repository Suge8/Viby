import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { isBunCompiled, projectPath } from '@/projectPath'

const CLI_SOURCE_STAMP_ENTRIES = ['package.json', 'src'] as const
const IGNORED_SOURCE_DIRECTORIES = new Set(['node_modules', 'dist', '.git'])

function getLatestPathMtimeMs(targetPath: string): number | undefined {
    if (!existsSync(targetPath)) {
        return undefined
    }

    const stats = statSync(targetPath)
    let latestMtimeMs = stats.mtimeMs
    if (!stats.isDirectory()) {
        return latestMtimeMs
    }

    const entries = readdirSync(targetPath, { withFileTypes: true })
    for (const entry of entries) {
        if (entry.isDirectory() && IGNORED_SOURCE_DIRECTORIES.has(entry.name)) {
            continue
        }

        const childMtimeMs = getLatestPathMtimeMs(join(targetPath, entry.name))
        if (typeof childMtimeMs === 'number' && childMtimeMs > latestMtimeMs) {
            latestMtimeMs = childMtimeMs
        }
    }

    return latestMtimeMs
}

export function getLatestCliSourceMtimeMs(cliProjectRoot: string): number | undefined {
    let latestMtimeMs: number | undefined

    for (const entry of CLI_SOURCE_STAMP_ENTRIES) {
        const entryMtimeMs = getLatestPathMtimeMs(join(cliProjectRoot, entry))
        if (typeof entryMtimeMs !== 'number') {
            continue
        }
        if (latestMtimeMs === undefined || entryMtimeMs > latestMtimeMs) {
            latestMtimeMs = entryMtimeMs
        }
    }

    return latestMtimeMs
}

export function getInstalledCliMtimeMs(): number | undefined {
    if (isBunCompiled()) {
        try {
            return statSync(process.execPath).mtimeMs
        } catch {
            return undefined
        }
    }

    return getLatestCliSourceMtimeMs(projectPath())
}
