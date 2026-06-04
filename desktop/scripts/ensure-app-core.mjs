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
import { fileURLToPath } from 'node:url'

const APP_CORE_NAME = 'viby-app-core'

function getTargetTriple() {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf-8' }).trim()
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const suffix = process.platform === 'win32' ? '.exe' : ''
const appCorePath = join(scriptDir, '..', 'src-tauri', 'binaries', `${APP_CORE_NAME}-${getTargetTriple()}${suffix}`)

if (!existsSync(appCorePath)) {
    console.error(`[desktop] AppCore binary missing: ${appCorePath}`)
    console.error('[desktop] provision it once from the repo root:')
    console.error('[desktop]   bun run build:app-core && (cd desktop && bun run prepare:app-core)')
    process.exit(1)
}

console.log(`[desktop] AppCore present, dev start skips rebuild: ${appCorePath}`)
