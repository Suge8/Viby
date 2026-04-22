import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactPath } from './generatedArtifactPaths'
import {
    collectTouchedPathsFromGit,
    describeScopedModules,
    moduleRootByName,
    resolveScopedModules,
} from './qualityScope'

type StyleCheckResult = {
    checkedFiles: string[]
    skippedFiles: string[]
    markdown: string
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/harness/style')
const supportedExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.jsonc', '.css', '.md', '.mdc'])
const biomeBinary =
    process.platform === 'win32'
        ? join(repoRoot, 'node_modules/.bin/biome.cmd')
        : join(repoRoot, 'node_modules/.bin/biome')

function isScopedPath(repoPath: string, scopedModules: readonly string[]): boolean {
    if (scopedModules.length === 0) {
        return false
    }

    return scopedModules.some((moduleName) =>
        repoPath.startsWith(moduleRootByName[moduleName as keyof typeof moduleRootByName])
    )
}

export function shouldStyleCheckFile(repoPath: string): boolean {
    if (repoPath === 'cli/src/runtime/embeddedAssets.bun.ts') {
        return false
    }

    if (isGeneratedArtifactPath(repoPath)) {
        return false
    }

    return supportedExtensions.has(extname(repoPath))
}

export function resolveStyleCheckFiles(options?: {
    scopeSpec?: string | null
    touchedPaths?: readonly string[]
    explicitFiles?: readonly string[]
}): {
    checkedFiles: string[]
    skippedFiles: string[]
    scopeDescription: string
} {
    const touchedPaths = [...(options?.touchedPaths ?? collectTouchedPathsFromGit())]
    const scopedModules = resolveScopedModules({
        scopeSpec: options?.scopeSpec,
        touchedPaths,
    })
    const explicitFiles = [...(options?.explicitFiles ?? [])]
    const candidateFiles = explicitFiles.length > 0 ? explicitFiles : touchedPaths
    const filteredByScope = options?.scopeSpec
        ? candidateFiles.filter((path) => isScopedPath(path, scopedModules))
        : candidateFiles

    const checkedFiles: string[] = []
    const skippedFiles: string[] = []
    for (const repoPath of filteredByScope) {
        if (!existsSync(join(repoRoot, repoPath)) || !shouldStyleCheckFile(repoPath)) {
            skippedFiles.push(repoPath)
            continue
        }
        checkedFiles.push(repoPath)
    }

    return {
        checkedFiles,
        skippedFiles,
        scopeDescription: describeScopedModules(scopedModules, {
            scopeSpec: options?.scopeSpec,
            touchedPaths,
        }),
    }
}

export function runStyleCheck(options?: {
    scopeSpec?: string | null
    touchedPaths?: readonly string[]
    explicitFiles?: readonly string[]
}): StyleCheckResult {
    const resolved = resolveStyleCheckFiles(options)
    if (resolved.checkedFiles.length > 0) {
        if (!existsSync(biomeBinary)) {
            throw new Error('Biome binary is missing. Run `bun install` to provision @biomejs/biome.')
        }

        execFileSync(
            biomeBinary,
            [
                'check',
                '--config-path',
                join(repoRoot, 'biome.json'),
                '--files-ignore-unknown=true',
                ...resolved.checkedFiles,
            ],
            {
                cwd: repoRoot,
                stdio: 'inherit',
            }
        )
    }

    const lines: string[] = []
    lines.push('# Harness Style Check')
    lines.push('')
    lines.push(`- Checked files: ${resolved.checkedFiles.length}`)
    lines.push(`- Skipped files: ${resolved.skippedFiles.length}`)
    lines.push(`- Scope: ${resolved.scopeDescription}`)
    lines.push('- Status: PASS')

    return {
        checkedFiles: resolved.checkedFiles,
        skippedFiles: resolved.skippedFiles,
        markdown: lines.join('\n'),
    }
}

function main(): void {
    const explicitFiles = process.env.VIBY_HARNESS_FILES
        ? process.env.VIBY_HARNESS_FILES.split(/[\n,]+/)
              .map((value) => value.trim())
              .filter(Boolean)
        : undefined
    const result = runStyleCheck({
        scopeSpec: process.env.VIBY_HARNESS_SCOPE,
        explicitFiles,
    })

    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(artifactDir, 'latest.md'), `${result.markdown}\n`)
    console.log('[harness] style check passed')
}

if (import.meta.main) {
    main()
}
