import { constants } from 'node:fs'
import { access, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type {
    MachineDirectoryEntry,
    MachineDirectoryResponse,
    MachineDirectoryRoot,
    MachineDirectoryRootKind,
} from '@viby/protocol/types'
import { getErrorMessage } from '@/modules/common/rpcResponses'

export interface BrowseMachineDirectoryRequest {
    path?: string | null
    workspaceRoot?: string | null
}

const ROOT_DIRECTORY_NAMES: Record<Exclude<MachineDirectoryRootKind, 'home'>, string> = {
    desktop: 'Desktop',
    documents: 'Documents',
    downloads: 'Downloads',
    projects: 'Projects',
    code: 'Code',
    workspace: 'Workspace',
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
            path: join(homePath, directoryName),
        })),
    ]

    const existingRoots = await Promise.all(
        candidates.map(async (candidate) => {
            return (await pathExists(candidate.path)) ? candidate : null
        })
    )

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

function isPathInside(rootPath: string, childPath: string): boolean {
    const relativePath = relative(rootPath, childPath)
    return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function resolveWorkspaceRoot(homePath: string, workspaceRoot?: string | null): string | null {
    const trimmedRoot = workspaceRoot?.trim()
    if (!trimmedRoot) {
        return null
    }
    return resolveRequestedPath(homePath, trimmedRoot)
}

function resolveScopedRequestedPath(
    homePath: string,
    requestedPath: string | null | undefined,
    scopeRoot: string | null
): string {
    const resolvedPath = resolveRequestedPath(scopeRoot ?? homePath, requestedPath)
    if (!scopeRoot || isPathInside(scopeRoot, resolvedPath)) {
        return resolvedPath
    }
    return scopeRoot
}

function getParentPath(currentPath: string, scopeRoot: string | null): string | null {
    if (scopeRoot && (!isPathInside(scopeRoot, currentPath) || currentPath === scopeRoot)) {
        return null
    }
    const parentPath = dirname(currentPath)
    if (scopeRoot && !isPathInside(scopeRoot, parentPath)) {
        return null
    }
    return parentPath === currentPath ? null : parentPath
}

export async function handleBrowseMachineDirectoryRequest(
    params: BrowseMachineDirectoryRequest | null | undefined
): Promise<MachineDirectoryResponse> {
    const homePath = homedir()
    const scopeRoot = resolveWorkspaceRoot(homePath, params?.workspaceRoot)
    const requestedPath = resolveScopedRequestedPath(homePath, params?.path, scopeRoot)
    const roots = scopeRoot ? [{ kind: 'workspace' as const, path: scopeRoot }] : await getSuggestedRoots(homePath)

    try {
        const entries = await readdir(requestedPath, { withFileTypes: true })
        const directories: MachineDirectoryEntry[] = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => ({
                name: entry.name,
                path: join(requestedPath, entry.name),
                type: 'directory' as const,
            }))
            .sort((left, right) => left.name.localeCompare(right.name))

        return {
            success: true,
            currentPath: requestedPath,
            parentPath: getParentPath(requestedPath, scopeRoot),
            scopeRoot,
            entries: directories,
            roots,
        }
    } catch (error) {
        return {
            success: false,
            roots,
            scopeRoot,
            error: getErrorMessage(error, 'Failed to browse directory'),
        }
    }
}
