import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SIDE_CAR_NAME = 'viby-sidecar'
const CLI_BINARY_NAME = 'viby'
const WINDOWS_EXTENSION = '.exe'

function getTargetTriple() {
    return execFileSync('rustc', ['--print', 'host-tuple'], {
        encoding: 'utf-8'
    }).trim()
}

function getBunTarget() {
    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64'
    }

    if (process.platform === 'win32') {
        return 'bun-windows-x64'
    }

    if (process.platform === 'linux') {
        return process.arch === 'arm64' ? 'bun-linux-arm64' : 'bun-linux-x64-baseline'
    }

    throw new Error(`Unsupported platform: ${process.platform}`)
}

function getExecutableName(baseName) {
    if (process.platform === 'win32') {
        return `${baseName}${WINDOWS_EXTENSION}`
    }

    return baseName
}

function main() {
    const scriptDir = dirname(fileURLToPath(import.meta.url))
    const desktopRoot = join(scriptDir, '..')
    const projectRoot = join(desktopRoot, '..')
    const targetTriple = getTargetTriple()
    const bunTarget = getBunTarget()
    const cliBinaryPath = join(
        projectRoot,
        'cli',
        'dist-exe',
        bunTarget,
        getExecutableName(CLI_BINARY_NAME)
    )

    if (!existsSync(cliBinaryPath)) {
        throw new Error(
            `Missing CLI binary at ${cliBinaryPath}. Run \`bun run build:single-exe\` from the repo root first.`
        )
    }

    const destinationPath = join(
        projectRoot,
        'desktop',
        'src-tauri',
        'binaries',
        `${SIDE_CAR_NAME}-${targetTriple}${process.platform === 'win32' ? WINDOWS_EXTENSION : ''}`
    )

    mkdirSync(dirname(destinationPath), { recursive: true })
    copyFileSync(cliBinaryPath, destinationPath)
    console.log(`[desktop] sidecar ready: ${destinationPath}`)
}

main()
