import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { MachineDirectoryEntry, MachineDirectoryResponse, MachineDirectoryRoot, MachineDirectoryRootKind } from '@viby/protocol/types'
import { getErrorMessage } from '@/modules/common/rpcResponses'

export interface BrowseMachineDirectoryRequest {
    path?: string | null
}

const ROOT_DIRECTORY_NAMES: Record<Exclude<MachineDirectoryRootKind, 'home'>, string> = {
    desktop: 'Desktop',
    documents: 'Documents',
    downloads: 'Downloads',
    projects: 'Projects',
    code: 'Code',
    workspace: 'Workspace'
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path, constants.R_OK)
        return true
    } catch {
        return false
    }
}

async function getSuggestedRoots(homePath: string): Promise<MachineDirectoryRoot[]> {
    const candidates: MachineDirectoryRoot[] = [
        { kind: 'home', path: homePath },
        ...Object.entries(ROOT_DIRECTORY_NAMES).map(([kind, directoryName]) => ({
            kind: kind as Exclude<MachineDirectoryRootKind, 'home'>,
            path: join(homePath, directoryName)
        }))
    ]

    const existingRoots = await Promise.all(candidates.map(async (candidate) => {
        return (await pathExists(candidate.path)) ? candidate : null
    }))

    const uniqueRoots = new Map<string, MachineDirectoryRoot>()
    for (const root of existingRoots) {
        if (!root) {
            continue
        }
        uniqueRoots.set(root.path, root)
    }

    return [...uniqueRoots.values()]
}

function resolveRequestedPath(homePath: string, requestedPath?: string | null): string {
    const trimmedPath = requestedPath?.trim()
    if (!trimmedPath) {
        return homePath
    }
    return isAbsolute(trimmedPath) ? resolve(trimmedPath) : resolve(homePath, trimmedPath)
}

function getParentPath(currentPath: string): string | null {
    const parentPath = dirname(currentPath)
    return parentPath === currentPath ? null : parentPath
}

export async function handleBrowseMachineDirectoryRequest(
    params: BrowseMachineDirectoryRequest | null | undefined
): Promise<MachineDirectoryResponse> {
    const homePath = homedir()
    const requestedPath = resolveRequestedPath(homePath, params?.path)
    const roots = await getSuggestedRoots(homePath)

    try {
        const entries = await readdir(requestedPath, { withFileTypes: true })
        const directories: MachineDirectoryEntry[] = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({
                name: entry.name,
                path: join(requestedPath, entry.name),
                type: 'directory' as const
            }))
            .sort((left, right) => left.name.localeCompare(right.name))

        return {
            success: true,
            currentPath: requestedPath,
            parentPath: getParentPath(requestedPath),
            entries: directories,
            roots
        }
    } catch (error) {
        return {
            success: false,
            roots,
            error: getErrorMessage(error, 'Failed to browse directory')
        }
    }
}
