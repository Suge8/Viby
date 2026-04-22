import { accessSync, constants, existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

const resolvedCommandPathCache = new Map<string, string | null>()

function canExecuteFile(filePath: string): boolean {
    try {
        accessSync(filePath, constants.X_OK)
        return true
    } catch {
        return false
    }
}

function resolveWindowsExtensions(command: string): string[] {
    const pathExt = process.env.PATHEXT?.split(';').filter(Boolean) ?? ['.EXE', '.CMD', '.BAT', '.COM']
    const hasExtension = /\.[^./\\]+$/u.test(command)
    if (hasExtension) {
        return [command]
    }

    return pathExt.map((extension) => `${command}${extension.toLowerCase()}`)
}

function resolveExecutableCandidates(command: string): string[] {
    if (process.platform === 'win32') {
        return resolveWindowsExtensions(command)
    }

    return [command]
}

function findCommandInPath(command: string): string | null {
    const rawPath = process.env.PATH
    if (!rawPath) {
        return null
    }

    const pathEntries = rawPath.split(delimiter).filter(Boolean)
    for (const pathEntry of pathEntries) {
        for (const candidate of resolveExecutableCandidates(command)) {
            const candidatePath = join(pathEntry, candidate)
            if (!existsSync(candidatePath)) {
                continue
            }

            if (process.platform === 'win32' || canExecuteFile(candidatePath)) {
                return candidatePath
            }
        }
    }

    return null
}

function normalizeResolvedPath(value: string): string | null {
    const trimmedValue = value.trim()
    if (!trimmedValue) {
        return null
    }

    if (!existsSync(trimmedValue)) {
        return null
    }

    return process.platform === 'win32' || canExecuteFile(trimmedValue) ? trimmedValue : null
}

export function resolveCommandPath(
    command: string,
    options?: {
        bypassCache?: boolean
    }
): string | null {
    const normalizedCommand = command.trim()
    if (!normalizedCommand) {
        return null
    }

    const cachedCommandPath = options?.bypassCache ? undefined : resolvedCommandPathCache.get(normalizedCommand)
    if (cachedCommandPath !== undefined) {
        return cachedCommandPath
    }

    const resolvedCommand = (() => {
        if (normalizedCommand.includes('/') || normalizedCommand.includes('\\')) {
            return normalizeResolvedPath(normalizedCommand)
        }

        return findCommandInPath(normalizedCommand)
    })()

    resolvedCommandPathCache.set(normalizedCommand, resolvedCommand)
    return resolvedCommand
}

export function resolveFirstAvailableCommand(
    candidates: readonly string[],
    options?: {
        bypassCache?: boolean
    }
): string | null {
    for (const candidate of candidates) {
        const resolvedCommand = resolveCommandPath(candidate, options)
        if (resolvedCommand) {
            return resolvedCommand
        }
    }

    return null
}
