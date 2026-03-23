import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { logger } from '@/ui/logger'

const UNIX_CODEX_CANDIDATES = [
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(homedir(), '.local', 'bin', 'codex'),
    join(homedir(), '.cargo', 'bin', 'codex'),
] as const

function findWindowsCodexPath(): string | null {
    const homeDir = homedir()
    const candidates = [
        join(homeDir, '.local', 'bin', 'codex.exe'),
        join(homeDir, 'AppData', 'Local', 'Programs', 'Codex', 'codex.exe'),
    ]

    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            logger.debug(`[Codex] Found Windows codex.exe at: ${candidate}`)
            return candidate
        }
    }

    try {
        const result = execSync('where codex.exe', {
            cwd: homeDir,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim().split('\n')[0]?.trim()

        if (result && existsSync(result)) {
            logger.debug(`[Codex] Found Windows codex.exe via where: ${result}`)
            return result
        }
    } catch {
        return null
    }

    return null
}

function findUnixCodexPath(): string | null {
    for (const candidate of UNIX_CODEX_CANDIDATES) {
        if (existsSync(candidate)) {
            logger.debug(`[Codex] Found codex binary at: ${candidate}`)
            return candidate
        }
    }

    try {
        const result = execSync('command -v codex', {
            cwd: homedir(),
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: '/bin/sh',
        }).trim()

        if (result && existsSync(result)) {
            logger.debug(`[Codex] Found codex via command -v: ${result}`)
            return result
        }
    } catch {
        return null
    }

    return null
}

function findCodexPath(): string | null {
    if (process.platform === 'win32') {
        return findWindowsCodexPath()
    }

    return findUnixCodexPath()
}

export function getDefaultCodexPath(): string {
    const override = process.env.VIBY_CODEX_PATH?.trim()
    if (override) {
        logger.debug(`[Codex] Using VIBY_CODEX_PATH: ${override}`)
        return override
    }

    const resolved = findCodexPath()
    if (!resolved) {
        throw new Error('Codex CLI not found. Install codex or set VIBY_CODEX_PATH.')
    }

    return resolved
}
