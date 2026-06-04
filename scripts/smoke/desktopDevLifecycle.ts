import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertNoExistingDesktopProcess, runDesktopLifecycleSmoke } from '../test-support/desktopLifecycleSmokeSupport'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const DESKTOP_MANIFEST = 'desktop/src-tauri/Cargo.toml'
const DEBUG_BINARY = `desktop/src-tauri/target/debug/viby${process.platform === 'win32' ? '.exe' : ''}`

export function debugDesktopBinaryPath(): string {
    return resolve(repoRoot, DEBUG_BINARY)
}

export function buildDesktopDebugBinary(): void {
    execFileSync('cargo', ['build', '--manifest-path', DESKTOP_MANIFEST], {
        cwd: repoRoot,
        stdio: 'inherit',
    })
}

async function main(): Promise<void> {
    assertNoExistingDesktopProcess()
    buildDesktopDebugBinary()
    const appBinary = process.env.VIBY_DESKTOP_DEV_SMOKE_APP_BINARY
        ? resolve(repoRoot, process.env.VIBY_DESKTOP_DEV_SMOKE_APP_BINARY)
        : debugDesktopBinaryPath()
    if (!existsSync(appBinary)) throw new Error(`Desktop debug binary missing after cargo build: ${appBinary}`)

    const outputDir = resolve(
        repoRoot,
        process.env.VIBY_DESKTOP_DEV_SMOKE_OUT_DIR || `desktop/.artifacts/dev-lifecycle-smoke-${Date.now()}`
    )
    const reportPath = await runDesktopLifecycleSmoke({
        appBinary,
        cwd: resolve(repoRoot, 'desktop/src-tauri'),
        outputDir,
        reportName: 'desktop-dev-lifecycle-smoke.json',
    })
    console.log(`[smoke] desktop dev lifecycle smoke passed. Report: ${reportPath}`)
}

if (import.meta.main) await main()
