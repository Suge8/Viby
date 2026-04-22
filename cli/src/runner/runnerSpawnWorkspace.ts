import fs from 'fs/promises'
import { logger } from '@/ui/logger'
import { isProcessAlive } from '@/utils/process'
import { createWorktree, removeWorktree, type WorktreeInfo } from './worktree'

export type SpawnWorkspace = {
    directoryCreated: boolean
    spawnDirectory: string
    worktreeInfo: WorktreeInfo | null
    maybeCleanupWorktree: (reason: string, pid?: number | null) => Promise<void>
}

export async function prepareSpawnWorkspace(options: {
    directory: string
    sessionType: 'simple' | 'worktree'
    approvedNewDirectoryCreation: boolean
    worktreeName?: string
}): Promise<
    | { ok: true; workspace: SpawnWorkspace }
    | {
          ok: false
          result:
              | { type: 'requestToApproveDirectoryCreation'; directory: string }
              | { type: 'error'; errorMessage: string }
      }
> {
    const { directory, sessionType, approvedNewDirectoryCreation, worktreeName } = options
    let directoryCreated = false
    let spawnDirectory = directory
    let worktreeInfo: WorktreeInfo | null = null

    if (sessionType === 'simple') {
        try {
            await fs.access(directory)
        } catch {
            if (!approvedNewDirectoryCreation) {
                return {
                    ok: false,
                    result: { type: 'requestToApproveDirectoryCreation', directory },
                }
            }

            try {
                await fs.mkdir(directory, { recursive: true })
                directoryCreated = true
            } catch (mkdirError) {
                const resolvedError = mkdirError as NodeJS.ErrnoException
                let errorMessage = `Unable to create directory at '${directory}'. `

                if (resolvedError.code === 'EACCES') {
                    errorMessage += `Permission denied. You don't have write access to create a folder at this location. Try using a different path or check your permissions.`
                } else if (resolvedError.code === 'ENOTDIR') {
                    errorMessage += `A file already exists at this path or in the parent path. Cannot create a directory here. Please choose a different location.`
                } else if (resolvedError.code === 'ENOSPC') {
                    errorMessage += `No space left on device. Your disk is full. Please free up some space and try again.`
                } else if (resolvedError.code === 'EROFS') {
                    errorMessage += `The file system is read-only. Cannot create directories here. Please choose a writable location.`
                } else {
                    errorMessage += `System error: ${resolvedError.message || String(mkdirError)}. Please verify the path is valid and you have the necessary permissions.`
                }

                return {
                    ok: false,
                    result: { type: 'error', errorMessage },
                }
            }
        }
    } else {
        try {
            await fs.access(directory)
        } catch {
            return {
                ok: false,
                result: {
                    type: 'error',
                    errorMessage: `Worktree sessions require an existing Git repository. Directory not found: ${directory}`,
                },
            }
        }

        const worktreeResult = await createWorktree({
            basePath: directory,
            nameHint: worktreeName,
        })
        if (!worktreeResult.ok) {
            return {
                ok: false,
                result: { type: 'error', errorMessage: worktreeResult.error },
            }
        }

        worktreeInfo = worktreeResult.info
        spawnDirectory = worktreeInfo.worktreePath
    }

    return {
        ok: true,
        workspace: {
            directoryCreated,
            spawnDirectory,
            worktreeInfo,
            maybeCleanupWorktree: async (reason: string, pid?: number | null) => {
                if (!worktreeInfo) {
                    return
                }

                if (pid && isProcessAlive(pid)) {
                    logger.debug(`[RUNNER RUN] Skipping worktree cleanup after ${reason}; child still running`, {
                        pid,
                        worktreePath: worktreeInfo.worktreePath,
                    })
                    return
                }

                const result = await removeWorktree({
                    repoRoot: worktreeInfo.basePath,
                    worktreePath: worktreeInfo.worktreePath,
                })
                if (!result.ok) {
                    logger.debug(`[RUNNER RUN] Failed to remove worktree ${worktreeInfo.worktreePath}: ${result.error}`)
                }
            },
        },
    }
}
