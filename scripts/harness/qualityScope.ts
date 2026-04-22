import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactPath } from './generatedArtifactPaths'

export const auditedModules = ['web', 'hub', 'cli', 'desktop', 'pairing', 'shared'] as const

export type AuditedModule = (typeof auditedModules)[number]

export const moduleRootByName: Record<AuditedModule, string> = {
    web: 'web/',
    hub: 'hub/',
    cli: 'cli/',
    desktop: 'desktop/',
    pairing: 'pairing/',
    shared: 'shared/',
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function isAuditedModule(value: string): value is AuditedModule {
    return auditedModules.includes(value as AuditedModule)
}

function normalizeScopeToken(value: string): string | null {
    const normalized = value.trim().toLowerCase()
    return normalized.length > 0 ? normalized : null
}

function parseGitPathList(output: string): string[] {
    const touchedPaths = new Set<string>()
    for (const line of output.split(/\r?\n/)) {
        const path = line.trim()
        if (path.length > 0) {
            touchedPaths.add(path)
        }
    }
    return [...touchedPaths]
}

function extractTouchedPath(statusLine: string): string | null {
    if (statusLine.length < 4) {
        return null
    }

    const payload = statusLine.slice(3).trim()
    if (payload.length === 0) {
        return null
    }

    if (payload.includes(' -> ')) {
        return payload.split(' -> ').at(-1) ?? null
    }

    return payload
}

export function parseScopeSpec(spec: string | null | undefined): string[] {
    if (!spec) {
        return []
    }

    const tokens = new Set<string>()
    for (const part of spec.split(/[,\s]+/)) {
        const token = normalizeScopeToken(part)
        if (token) {
            tokens.add(token)
        }
    }
    return [...tokens]
}

export function collectTouchedPathsFromGit(cwd: string = repoRoot): string[] {
    const output = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd,
        encoding: 'utf8',
    })

    const touchedPaths = new Set<string>()
    for (const line of output.split(/\r?\n/)) {
        const path = extractTouchedPath(line)
        if (path) {
            touchedPaths.add(path)
        }
    }

    if (touchedPaths.size > 0) {
        return [...touchedPaths].filter((path) => !isGeneratedArtifactPath(path))
    }

    const explicitDiffBase = process.env.VIBY_HARNESS_DIFF_BASE?.trim()
    if (explicitDiffBase) {
        return parseGitPathList(
            execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${explicitDiffBase}...HEAD`], {
                cwd,
                encoding: 'utf8',
            })
        )
    }

    const baseRef = process.env.GITHUB_BASE_REF?.trim()
    if (baseRef) {
        try {
            const remoteBase = `origin/${baseRef}`
            execFileSync('git', ['rev-parse', '--verify', remoteBase], { cwd, stdio: 'ignore' })
            const mergeBase = execFileSync('git', ['merge-base', 'HEAD', remoteBase], {
                cwd,
                encoding: 'utf8',
            }).trim()
            if (mergeBase.length > 0) {
                return parseGitPathList(
                    execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase}..HEAD`], {
                        cwd,
                        encoding: 'utf8',
                    })
                )
            }
        } catch {
            // Fall through to generic local refs.
        }
    }

    for (const candidate of ['origin/main', 'origin/master']) {
        try {
            execFileSync('git', ['rev-parse', '--verify', candidate], { cwd, stdio: 'ignore' })
            const mergeBase = execFileSync('git', ['merge-base', 'HEAD', candidate], {
                cwd,
                encoding: 'utf8',
            }).trim()
            if (mergeBase.length === 0) {
                continue
            }
            const diffPaths = parseGitPathList(
                execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', `${mergeBase}..HEAD`], {
                    cwd,
                    encoding: 'utf8',
                })
            )
            if (diffPaths.length > 0) {
                return diffPaths.filter((path) => !isGeneratedArtifactPath(path))
            }
        } catch {
            // Try next candidate.
        }
    }

    try {
        return parseGitPathList(
            execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD~1..HEAD'], {
                cwd,
                encoding: 'utf8',
            })
        ).filter((path) => !isGeneratedArtifactPath(path))
    } catch {
        return []
    }
}

export function resolveModulesFromTouchedPaths(paths: readonly string[]): AuditedModule[] {
    const scopedModules = new Set<AuditedModule>()
    for (const path of paths) {
        for (const moduleName of auditedModules) {
            if (path.startsWith(moduleRootByName[moduleName])) {
                scopedModules.add(moduleName)
            }
        }
    }

    return auditedModules.filter((moduleName) => scopedModules.has(moduleName))
}

export function resolveScopedModules(options: {
    scopeSpec?: string | null
    touchedPaths?: readonly string[]
}): AuditedModule[] {
    const tokens = parseScopeSpec(options.scopeSpec)
    if (tokens.includes('all')) {
        return [...auditedModules]
    }

    const explicitModules = tokens.filter(isAuditedModule)
    if (explicitModules.length > 0) {
        return explicitModules
    }

    if (tokens.length > 0) {
        return []
    }

    const touchedModules = resolveModulesFromTouchedPaths(options.touchedPaths ?? [])
    return touchedModules.length > 0 ? touchedModules : [...auditedModules]
}

export function describeScopedModules(
    scopeModules: readonly AuditedModule[],
    options?: {
        scopeSpec?: string | null
        touchedPaths?: readonly string[]
    }
): string {
    const tokens = parseScopeSpec(options?.scopeSpec)
    if (tokens.length > 0) {
        return scopeModules.length > 0
            ? `explicit scope: ${scopeModules.join(', ')}`
            : `explicit scope: ${tokens.join(', ')} (no audited modules)`
    }

    const touchedModules = resolveModulesFromTouchedPaths(options?.touchedPaths ?? [])
    if (touchedModules.length > 0) {
        return `touched scope: ${touchedModules.join(', ')}`
    }

    return 'full scope: all audited modules'
}
