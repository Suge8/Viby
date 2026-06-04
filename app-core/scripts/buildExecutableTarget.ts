import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_TARGETS = [
    'bun-darwin-x64',
    'bun-darwin-arm64',
    'bun-linux-x64-baseline',
    'bun-linux-arm64',
    'bun-windows-x64',
]

const SUPPORTED_PLATFORMS = new Set(['darwin', 'linux', 'windows'])
const SUPPORTED_ARCHES = new Set(['x64', 'arm64'])
const SUPPORTED_LINUX_X64_VARIANTS = new Set(['baseline', 'modern'])

function resolveHostPlatform(): string {
    if (process.platform === 'win32') {
        return 'windows'
    }
    if (process.platform === 'darwin' || process.platform === 'linux') {
        return process.platform
    }
    throw new Error(`Unsupported host platform: ${process.platform}`)
}

function resolveHostArch(): string {
    if (SUPPORTED_ARCHES.has(process.arch)) {
        return process.arch
    }
    throw new Error(`Unsupported host arch: ${process.arch}`)
}

function resolveDefaultTarget(): string {
    const platform = resolveHostPlatform()
    const arch = resolveHostArch()
    return platform === 'linux' && arch === 'x64' ? 'bun-linux-x64-baseline' : `bun-${platform}-${arch}`
}

function assertTargetParts(target: string): string[] {
    const parts = target.split('-')
    if (parts.length < 2 || parts.length > 4 || parts[0] !== 'bun') {
        throw new Error(`Invalid target: ${target}`)
    }
    return parts
}

function assertPlatformArch(target: string, platform: string, arch: string): void {
    if (!SUPPORTED_PLATFORMS.has(platform)) {
        throw new Error(`Unsupported platform in target: ${target}`)
    }
    if (!SUPPORTED_ARCHES.has(arch)) {
        throw new Error(`Unsupported arch in target: ${target}`)
    }
}

function assertVariant(target: string, platform: string, arch: string, variant?: string): void {
    if (!variant) {
        return
    }
    if (platform !== 'linux' || arch !== 'x64') {
        throw new Error(`Unsupported variant in target: ${target}`)
    }
    if (!SUPPORTED_LINUX_X64_VARIANTS.has(variant)) {
        throw new Error(`Unsupported linux x64 variant in target: ${target}`)
    }
}

export function resolveTarget(target?: string): string {
    if (!target) {
        return resolveDefaultTarget()
    }

    const parts = assertTargetParts(target)
    const platform = parts[1]
    const arch = parts[2] ?? resolveHostArch()
    const variant = parts[3]

    assertPlatformArch(target, platform, arch)
    assertVariant(target, platform, arch, variant)

    return variant ? `bun-${platform}-${arch}-${variant}` : `bun-${platform}-${arch}`
}

export function parseTarget(target: string): { platform: string; arch: string } {
    const parts = assertTargetParts(target)
    if (parts.length !== 3 && parts.length !== 4) {
        throw new Error(`Invalid target: ${target}`)
    }

    const platform = parts[1]
    const arch = parts[2]
    assertPlatformArch(target, platform, arch)
    assertVariant(target, platform, arch, parts[3])

    return {
        platform: platform === 'windows' ? 'win32' : platform,
        arch,
    }
}

export function getFeatureFlag(platform: string, arch: string): string {
    const platformToken = platform === 'win32' ? 'WIN32' : platform.toUpperCase()
    return `VIBY_TARGET_${platformToken}_${arch.toUpperCase()}`
}

function getPlatformDir(platform: string, arch: string): string {
    if (platform === 'darwin') {
        return arch === 'arm64' ? 'arm64-darwin' : 'x64-darwin'
    }
    if (platform === 'linux') {
        return arch === 'arm64' ? 'arm64-linux' : 'x64-linux'
    }
    if (platform === 'win32') {
        return 'x64-win32'
    }
    throw new Error(`Unsupported platform: ${platform}`)
}

export function assertArchivesExist(projectRoot: string, platform: string, arch: string): void {
    const platformDir = getPlatformDir(platform, arch)
    const archiveNames = ['difftastic', 'ripgrep']

    for (const name of archiveNames) {
        const archive = join(projectRoot, 'tools', 'archives', `${name}-${platformDir}.tar.gz`)
        if (!existsSync(archive)) {
            throw new Error(`Missing archive: ${archive}`)
        }
    }
}
