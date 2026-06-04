import { existsSync, lstatSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const defaultKeepCount = 3

const fullCleanRoots = [
    '.artifacts',
    'app-core/.artifacts',
    'desktop/.artifacts',
    'hub/.artifacts',
    'pairing/.artifacts',
    'shared/.artifacts',
    'site/.artifacts',
    'web/.artifacts',
] as const
const retainedArtifactDirs = [
    '.artifacts/harness',
    '.artifacts/smoke',
    'web/.artifacts/harness',
    'web/.artifacts/smoke',
    'desktop/.artifacts',
] as const

type CleanupMode = 'old' | 'all'

type CleanupOptions = {
    mode: CleanupMode
    keepCount: number
    dryRun: boolean
}

type CleanupEntry = {
    path: string
    reason: string
}

function parseOptions(args: string[]): CleanupOptions {
    let mode: CleanupMode = 'old'
    let keepCount = defaultKeepCount
    let dryRun = false

    for (const arg of args) {
        if (arg === '--all') {
            mode = 'all'
            continue
        }
        if (arg === '--dry-run') {
            dryRun = true
            continue
        }
        if (arg.startsWith('--keep=')) {
            keepCount = parseKeepCount(arg.slice('--keep='.length))
            continue
        }
        throw new Error(`Unknown argument: ${arg}`)
    }

    return { mode, keepCount, dryRun }
}

function parseKeepCount(value: string): number {
    const keepCount = Number(value)
    if (!Number.isInteger(keepCount) || keepCount < 0) {
        throw new Error(`Invalid --keep value: ${value}`)
    }
    return keepCount
}

function safeResolve(root: string, repoPath: string): string {
    const absolutePath = resolve(root, repoPath)
    const relativePath = relative(root, absolutePath)
    if (relativePath.startsWith('..') || relativePath === '' || relativePath.includes(`..${sep}`)) {
        throw new Error(`Refusing to clean outside repo: ${repoPath}`)
    }
    return absolutePath
}

export function buildArtifactCleanupPlan(root: string, options: CleanupOptions): CleanupEntry[] {
    if (options.mode === 'all') {
        return fullCleanRoots
            .filter((repoPath) => existsSync(safeResolve(root, repoPath)))
            .map((path) => ({ path, reason: 'full artifact clean' }))
    }

    const entries: CleanupEntry[] = []
    for (const repoPath of retainedArtifactDirs) {
        const absoluteDir = safeResolve(root, repoPath)
        if (!existsSync(absoluteDir)) {
            continue
        }
        if (!lstatSync(absoluteDir).isDirectory()) {
            continue
        }

        const children = readdirSync(absoluteDir)
            .map((name) => {
                const absolutePath = resolve(absoluteDir, name)
                const stats = statSync(absolutePath)
                return {
                    path: `${repoPath}/${name}`,
                    reason: `${repoPath}: keep latest ${options.keepCount}`,
                    mtimeMs: stats.mtimeMs,
                }
            })
            .sort((left, right) => right.mtimeMs - left.mtimeMs)
            .slice(options.keepCount)
            .map(({ path, reason }) => ({ path, reason }))
        entries.push(...children)
    }
    return entries
}

function cleanArtifacts(options: CleanupOptions): void {
    const entries = buildArtifactCleanupPlan(repoRoot, options)
    for (const entry of entries) {
        console.log(`[clean:artifacts] ${options.dryRun ? 'would remove' : 'remove'} ${entry.path} (${entry.reason})`)
        if (!options.dryRun) {
            rmSync(safeResolve(repoRoot, entry.path), { force: true, recursive: true })
        }
    }
    if (entries.length === 0) {
        console.log('[clean:artifacts] nothing to clean')
    }
}

if (import.meta.main) {
    cleanArtifacts(parseOptions(process.argv.slice(2)))
}
