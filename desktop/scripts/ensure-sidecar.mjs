/**
 * Dev-loop guard for the Tauri sidecar binary.
 *
 * Dev mode runs the Hub straight from source (`spawn_dev_hub`), so it never
 * executes the sidecar. Tauri still validates that the `externalBin` file
 * exists before `tauri dev` starts. This guard only checks for that file:
 * present means skip, missing means fail fast with a one-time provisioning
 * hint. It never rebuilds the 80MB+ binary on every dev start.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIDECAR_NAME = 'viby-sidecar'

function getTargetTriple() {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf-8' }).trim()
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const suffix = process.platform === 'win32' ? '.exe' : ''
const sidecarPath = join(scriptDir, '..', 'src-tauri', 'binaries', `${SIDECAR_NAME}-${getTargetTriple()}${suffix}`)

if (!existsSync(sidecarPath)) {
    console.error(`[desktop] sidecar binary missing: ${sidecarPath}`)
    console.error('[desktop] provision it once from the repo root:')
    console.error('[desktop]   bun run build:single-exe && (cd desktop && bun run prepare:sidecar)')
    process.exit(1)
}

console.log(`[desktop] sidecar present, dev start skips the rebuild: ${sidecarPath}`)
