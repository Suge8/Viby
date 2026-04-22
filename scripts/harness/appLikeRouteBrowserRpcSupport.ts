import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

type FakeGitCommandResult = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export function handleFakeSessionRpc(options: { method: string; params: unknown; workspaceRoot: string }): unknown {
    const paramsRecord =
        options.params && typeof options.params === 'object' ? (options.params as Record<string, unknown>) : {}

    switch (options.method) {
        case 'git-status': {
            const cwd = resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath: typeof paramsRecord.cwd === 'string' ? paramsRecord.cwd : options.workspaceRoot,
            })
            return runFakeGitCommand({
                args: ['status', '--porcelain=v2', '--branch', '--untracked-files=all'],
                cwd,
            })
        }
        case 'git-diff-numstat': {
            const cwd = resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath: typeof paramsRecord.cwd === 'string' ? paramsRecord.cwd : options.workspaceRoot,
            })
            return runFakeGitCommand({
                args: paramsRecord.staged === true ? ['diff', '--cached', '--numstat'] : ['diff', '--numstat'],
                cwd,
            })
        }
        case 'git-diff-file': {
            const cwd = resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath: typeof paramsRecord.cwd === 'string' ? paramsRecord.cwd : options.workspaceRoot,
            })
            const filePath = typeof paramsRecord.filePath === 'string' ? paramsRecord.filePath : ''
            if (!filePath) {
                return { success: false, error: 'Missing file path' }
            }
            resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath: join(cwd, filePath),
            })
            return runFakeGitCommand({
                args:
                    paramsRecord.staged === true
                        ? ['diff', '--cached', '--no-ext-diff', '--', filePath]
                        : ['diff', '--no-ext-diff', '--', filePath],
                cwd,
            })
        }
        case 'readFile': {
            const filePath = typeof paramsRecord.path === 'string' ? paramsRecord.path : ''
            if (!filePath) {
                return { success: false, error: 'Missing file path' }
            }
            const resolvedPath = resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath: join(options.workspaceRoot, filePath),
            })
            return {
                success: true,
                content: readFileSync(resolvedPath).toString('base64'),
            }
        }
        case 'listDirectory': {
            const targetPath =
                typeof paramsRecord.path === 'string' && paramsRecord.path.length > 0
                    ? paramsRecord.path
                    : options.workspaceRoot
            const resolvedPath = resolveWorkspaceTarget({
                rootPath: options.workspaceRoot,
                targetPath,
            })

            const entries = readdirSync(resolvedPath, { withFileTypes: true })
                .map((entry) => {
                    const fullPath = join(resolvedPath, entry.name)
                    const stats = statSync(fullPath)
                    return {
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
                        size: stats.size,
                        modified: stats.mtime.getTime(),
                    }
                })
                .sort((left, right) => {
                    if (left.type === 'directory' && right.type !== 'directory') return -1
                    if (left.type !== 'directory' && right.type === 'directory') return 1
                    return left.name.localeCompare(right.name)
                })

            return {
                success: true,
                entries,
            }
        }
        default:
            return { error: `Unsupported RPC method: ${options.method}` }
    }
}

function resolveWorkspaceTarget(options: { rootPath: string; targetPath?: string }): string {
    const resolvedRoot = resolve(options.rootPath)
    const resolvedTarget = options.targetPath
        ? options.targetPath.startsWith('/')
            ? resolve(options.targetPath)
            : resolve(resolvedRoot, options.targetPath)
        : resolvedRoot
    const relativePath = relative(resolvedRoot, resolvedTarget)

    if (relativePath.startsWith('..') || relativePath === '..') {
        throw new Error('Requested path escapes prepared workspace root.')
    }

    return resolvedTarget
}

function runFakeGitCommand(options: { args: string[]; cwd: string }): FakeGitCommandResult {
    try {
        const stdout = execFileSync('git', options.args, {
            cwd: options.cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        return {
            success: true,
            stdout,
            stderr: '',
            exitCode: 0,
        }
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & {
            stdout?: string | Buffer
            stderr?: string | Buffer
            status?: number | null
        }

        return {
            success: false,
            stdout: typeof execError.stdout === 'string' ? execError.stdout : (execError.stdout?.toString() ?? ''),
            stderr: typeof execError.stderr === 'string' ? execError.stderr : (execError.stderr?.toString() ?? ''),
            exitCode: execError.status ?? 1,
            error: execError.message,
        }
    }
}
