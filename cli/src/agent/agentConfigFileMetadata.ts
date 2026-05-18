import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import type { AgentConfigBackup, AgentConfigFileStamp } from '@viby/protocol/agentConfig'

const BACKUP_DIR = '.viby-backups'
const BACKUP_LIMIT = 12

function isNotFound(error: unknown): boolean {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function backupDirectory(path: string): string {
    return join(dirname(path), BACKUP_DIR)
}

function backupPrefix(path: string): string {
    return `${basename(path)}.`
}

export async function readAgentConfigStamp(path: string): Promise<AgentConfigFileStamp | undefined> {
    try {
        const [stats, content] = await Promise.all([stat(path), readFile(path)])
        if (!stats.isFile()) return undefined
        return {
            mtimeMs: stats.mtimeMs,
            size: stats.size,
            sha256: createHash('sha256').update(content).digest('hex'),
        }
    } catch (error) {
        if (isNotFound(error)) return undefined
        throw error
    }
}

export async function listAgentConfigBackups(path: string): Promise<AgentConfigBackup[]> {
    const directory = backupDirectory(path)
    const prefix = backupPrefix(path)
    try {
        const names = await readdir(directory)
        const backups = await Promise.all(
            names
                .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
                .map(async (name) => {
                    const backupPath = join(directory, name)
                    return { path: backupPath, createdAt: (await stat(backupPath)).mtimeMs }
                })
        )
        return backups.sort((left, right) => right.createdAt - left.createdAt).slice(0, BACKUP_LIMIT)
    } catch (error) {
        if (isNotFound(error)) return []
        throw error
    }
}

export async function createAgentConfigBackup(path: string): Promise<AgentConfigBackup | null> {
    const current = await readAgentConfigStamp(path)
    if (!current) return null

    const directory = backupDirectory(path)
    await mkdir(directory, { recursive: true })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = join(directory, `${backupPrefix(path)}${timestamp}.${process.pid}.bak`)
    await copyFile(path, backupPath)
    return { path: backupPath, createdAt: Date.now() }
}

export async function assertAgentConfigUnchanged(
    path: string,
    expectedExists?: boolean,
    expectedStamp?: AgentConfigFileStamp
): Promise<void> {
    const current = await readAgentConfigStamp(path)
    if (expectedExists === false && current) throw new Error('Config changed on disk. Reload before saving.')
    if (!expectedStamp) return
    if (!current || current.size !== expectedStamp.size || current.sha256 !== expectedStamp.sha256) {
        throw new Error('Config changed on disk. Reload before saving.')
    }
}

export async function restoreAgentConfigBackupFile(configPath: string, backupPath: string): Promise<void> {
    const directory = backupDirectory(configPath)
    const rel = relative(directory, backupPath)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error('Backup path is outside the config backup directory')
    }
    await stat(backupPath)
    await createAgentConfigBackup(configPath)
    await mkdir(dirname(configPath), { recursive: true })
    await copyFile(backupPath, configPath)
}
