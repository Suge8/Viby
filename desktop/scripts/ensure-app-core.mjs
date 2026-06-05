/**
 * Dev-loop guard for the bundled AppCore binary.
 *
 * Dev mode runs AppCore from source, but Tauri validates externalBin before
 * boot. This script only checks that the packaged placeholder exists; it does
 * not rebuild the binary on every dev start.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP_CORE_NAME = 'viby-app-core'
const SCRIPT_PATH = 'desktop/scripts/ensure-app-core.mjs'

function getTargetTriple() {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf-8' }).trim()
}

function resolveAppCorePath() {
    const scriptDir = dirname(fileURLToPath(import.meta.url))
    const suffix = process.platform === 'win32' ? '.exe' : ''
    return join(scriptDir, '..', 'src-tauri', 'binaries', `${APP_CORE_NAME}-${getTargetTriple()}${suffix}`)
}

export function formatMissingAppCoreError(appCorePath) {
    return [
        '[desktop] ERROR AppCore binary missing',
        `[desktop] reason: ${appCorePath} does not exist`,
        '[desktop] fix: bun run build:app-core && bun run --cwd desktop prepare:app-core',
        `[desktop] details: ${SCRIPT_PATH}`,
    ]
}

export function formatAppCoreCheckError(message) {
    return [
        '[desktop] ERROR AppCore check failed',
        `[desktop] reason: ${message}`,
        '[desktop] fix: install Rust and rerun bun run dev:desktop',
        `[desktop] details: ${SCRIPT_PATH}`,
    ]
}

function writeError(lines) {
    for (const line of lines) console.error(line)
}

export function run() {
    try {
        const appCorePath = resolveAppCorePath()
        if (!existsSync(appCorePath)) {
            writeError(formatMissingAppCoreError(appCorePath))
            return 1
        }
        return 0
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeError(formatAppCoreCheckError(message))
        return 1
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = run()
}
