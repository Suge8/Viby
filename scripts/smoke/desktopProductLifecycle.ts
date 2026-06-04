import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    assertNoExistingDesktopProcess,
    isPidAlive,
    readRuntimeStatus,
    reserveTcpPort,
    runDesktopLifecycleSmoke,
} from '../test-support/desktopLifecycleSmokeSupport'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const DEFAULT_APP_BINARY = 'desktop/src-tauri/target/release/bundle/macos/Viby.app/Contents/MacOS/Viby'

export { isPidAlive, readRuntimeStatus, reserveTcpPort }

async function main(): Promise<void> {
    assertNoExistingDesktopProcess()
    const appBinary = resolve(repoRoot, process.env.VIBY_DESKTOP_SMOKE_APP_BINARY || DEFAULT_APP_BINARY)
    if (!existsSync(appBinary)) throw new Error(`Desktop app binary missing: ${appBinary}`)

    const outputDir = resolve(
        repoRoot,
        process.env.VIBY_DESKTOP_SMOKE_OUT_DIR || `desktop/.artifacts/lifecycle-smoke-${Date.now()}`
    )
    const reportPath = await runDesktopLifecycleSmoke({
        appBinary,
        cwd: dirname(appBinary),
        outputDir,
        reportName: 'desktop-product-lifecycle-smoke.json',
    })
    console.log(`[smoke] desktop product lifecycle smoke passed. Report: ${reportPath}`)
}

if (import.meta.main) await main()
