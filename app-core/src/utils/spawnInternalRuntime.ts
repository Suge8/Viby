/** Spawns AppCore-owned internal runtime child processes across platforms. */

import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type ChildProcess, SpawnOptions, spawn } from 'child_process'
import { APP_CORE_INTERNAL_ENV } from '@/internalRuntimeBootstrap'
import { isBunCompiled, projectPath } from '@/projectPath'
import { logger } from '@/ui/logger'

/**
 * Resolve the TypeScript entrypoint for development mode.
 */
function resolveEntrypoint(projectRoot: string): string {
    const srcEntrypoint = join(projectRoot, 'src', 'internalRuntimeBootstrap.ts')
    if (existsSync(srcEntrypoint)) {
        return srcEntrypoint
    }

    throw new Error('No internal runtime entrypoint found (expected src/internalRuntimeBootstrap.ts)')
}

export interface InternalRuntimeCommand {
    command: string
    args: string[]
}

function isCrossPlatformAbsolutePath(value: string): boolean {
    return isAbsolute(value) || win32.isAbsolute(value)
}

function resolveInvokedCwd(cwd: SpawnOptions['cwd']): string {
    if (cwd instanceof URL) {
        return fileURLToPath(cwd)
    }

    if (typeof cwd === 'string' && cwd.trim().length > 0) {
        const normalizedCwd = cwd.trim()
        return isCrossPlatformAbsolutePath(normalizedCwd) ? normalizedCwd : resolve(normalizedCwd)
    }

    const inheritedInvokedCwd = process.env.VIBY_INVOKED_CWD?.trim()
    if (inheritedInvokedCwd && isCrossPlatformAbsolutePath(inheritedInvokedCwd)) {
        return inheritedInvokedCwd
    }

    return process.cwd()
}

export function getInternalRuntimeCommand(args: string[]): InternalRuntimeCommand {
    // Compiled binary mode: just use the executable directly
    if (isBunCompiled()) {
        return {
            command: process.execPath,
            args,
        }
    }

    // Development mode: spawn with TypeScript internal runtime entrypoint
    const projectRoot = projectPath()
    const entrypoint = resolveEntrypoint(projectRoot)
    const isBunRuntime = Boolean((process.versions as Record<string, string | undefined>).bun)

    if (isBunRuntime) {
        // Bun can run TypeScript directly.
        // Force Bun's cwd to the AppCore project root so alias resolution via bunfig.toml
        // keeps working even when Desktop launches providers from another workspace.
        return {
            command: process.execPath,
            args: ['--cwd', projectRoot, entrypoint, ...args],
        }
    }

    // Node.js fallback: preserve execArgv (for compatibility)
    return {
        command: process.execPath,
        args: [...process.execArgv, entrypoint, ...args],
    }
}

export function withWindowsSpawnOptions(options: SpawnOptions, platform: NodeJS.Platform): SpawnOptions {
    return platform === 'win32' && options.detached ? { ...options, windowsHide: true } : options
}

export function spawnInternalRuntime(args: string[], options: SpawnOptions = {}): ChildProcess {
    let directory: string | URL | undefined
    if ('cwd' in options) {
        directory = options.cwd
    } else {
        directory = process.cwd()
    }
    const fullCommand = `app-core-internal ${args.join(' ')}`
    logger.debug(`[SPAWN INTERNAL RUNTIME] Spawning: ${fullCommand} in ${directory}`)

    const { command: spawnCommand, args: spawnArgs } = getInternalRuntimeCommand(args)

    // Sanity check that the entrypoint path exists
    if (!isBunCompiled()) {
        const entrypoint = spawnArgs.find((arg) => arg.endsWith('internalRuntimeBootstrap.ts'))
        if (entrypoint && !existsSync(entrypoint)) {
            const errorMessage = `Entrypoint ${entrypoint} does not exist`
            logger.debug(`[SPAWN INTERNAL RUNTIME] ${errorMessage}`)
            throw new Error(errorMessage)
        }
    }

    // On Windows, detached processes allocate a new console window by default.
    // windowsHide: true suppresses this to prevent cmd windows from accumulating.
    const finalOptions: SpawnOptions = { ...options }
    const finalEnv: NodeJS.ProcessEnv = { ...process.env, ...options.env, [APP_CORE_INTERNAL_ENV]: '1' }
    if (!isBunCompiled()) {
        const invokedCwd = finalEnv.VIBY_INVOKED_CWD?.trim()
        const hasExplicitCwd = 'cwd' in options && options.cwd !== undefined
        finalEnv.VIBY_INVOKED_CWD = hasExplicitCwd
            ? resolveInvokedCwd(options.cwd)
            : invokedCwd && isCrossPlatformAbsolutePath(invokedCwd)
              ? invokedCwd
              : resolveInvokedCwd(options.cwd)
    }
    finalOptions.env = finalEnv
    return spawn(spawnCommand, spawnArgs, withWindowsSpawnOptions(finalOptions, process.platform))
}
