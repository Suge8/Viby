import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const APP_CORE_NAME = 'viby-app-core'
const WINDOWS_EXTENSION = '.exe'
const SCRIPT_PATH = 'desktop/scripts/prepare-app-core.mjs'

function getTargetTriple() {
    return execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf-8' }).trim()
}

function getBunTarget() {
    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64'
    }
    if (process.platform === 'win32') return 'bun-windows-x64'
    if (process.platform === 'linux') {
        return process.arch === 'arm64' ? 'bun-linux-arm64' : 'bun-linux-x64-baseline'
    }
    throw new Error(`Unsupported platform: ${process.platform}`)
}

function executableName(baseName) {
    return process.platform === 'win32' ? `${baseName}${WINDOWS_EXTENSION}` : baseName
}

export function formatPrepareAppCoreError(message) {
    return [
        '[desktop] ERROR AppCore prepare failed',
        `[desktop] reason: ${message}`,
        '[desktop] fix: bun run build:app-core && bun run --cwd desktop prepare:app-core',
        `[desktop] details: ${SCRIPT_PATH}`,
    ]
}

function writeError(lines) {
    for (const line of lines) console.error(line)
}

export function main() {
    const scriptDir = dirname(fileURLToPath(import.meta.url))
    const desktopRoot = join(scriptDir, '..')
    const projectRoot = join(desktopRoot, '..')
    const targetTriple = getTargetTriple()
    const appCoreBinaryPath = join(projectRoot, 'app-core', 'dist-exe', getBunTarget(), executableName(APP_CORE_NAME))

    if (!existsSync(appCoreBinaryPath)) {
        throw new Error(`Missing AppCore binary at ${appCoreBinaryPath}.`)
    }

    const destinationPath = join(
        projectRoot,
        'desktop',
        'src-tauri',
        'binaries',
        `${APP_CORE_NAME}-${targetTriple}${process.platform === 'win32' ? WINDOWS_EXTENSION : ''}`
    )

    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(appCoreBinaryPath, destinationPath)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        writeError(formatPrepareAppCoreError(message))
        process.exitCode = 1
    }
}
