import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactPath } from './generatedArtifactPaths'
import { collectGovernanceSourceMetrics, type GovernanceSourceMetrics } from './governancePolicy'
import { sourceLineBudgetAllowlist, sourceLineLimit, testLineBudgetAllowlist, testLineLimit } from './lineBudgetConfig'
import {
    collectTouchedPathsFromGit,
    describeScopedModules,
    moduleRootByName,
    resolveScopedModules,
} from './qualityScope'

type NewCodeViolation = {
    file: string
    rule: string
    message: string
}

type NewCodeGateResult = {
    inspectedFiles: string[]
    violations: NewCodeViolation[]
    markdown: string
}

export type TouchedBudgetEntry = {
    file: string
    baselineLines: number
    currentLines: number
    isTestFile: boolean
    baselineGovernanceMetrics: GovernanceSourceMetrics
    currentGovernanceMetrics: GovernanceSourceMetrics
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/harness/new-code')
const auditExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const governanceGrowthRules: ReadonlyArray<{
    metricName: keyof GovernanceSourceMetrics
    rule: string
}> = [
    { metricName: 'rawButtonRefs', rule: 'raw-button-sprawl' },
    { metricName: 'rawInputRefs', rule: 'raw-input-sprawl' },
    { metricName: 'rawTextareaRefs', rule: 'raw-textarea-sprawl' },
    { metricName: 'rawSelectRefs', rule: 'raw-select-sprawl' },
    { metricName: 'designMagicRefs', rule: 'design-magic-sprawl' },
    { metricName: 'consoleRefs', rule: 'console-sprawl' },
    { metricName: 'fireAndForgetRefs', rule: 'fire-and-forget-sprawl' },
    { metricName: 'controllerOwnerViolationRefs', rule: 'controller-owner-sprawl' },
    { metricName: 'unownedControlSurfaceRefs', rule: 'control-surface-sprawl' },
]

function countLines(content: string): number {
    return content.split(/\r?\n/).length
}

function readHeadFile(repoPath: string): string | null {
    try {
        return execFileSync('git', ['show', `HEAD:${repoPath}`], {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        })
    } catch {
        return null
    }
}

function isScopedPath(repoPath: string, scopedModules: readonly string[]): boolean {
    if (scopedModules.length === 0) {
        return false
    }

    return scopedModules.some((moduleName) =>
        repoPath.startsWith(moduleRootByName[moduleName as keyof typeof moduleRootByName])
    )
}

function isAuditedSourcePath(repoPath: string): boolean {
    return (
        !isGeneratedArtifactPath(repoPath) &&
        Object.values(moduleRootByName).some((root) => repoPath.startsWith(root)) &&
        auditExtensions.has(extname(repoPath))
    )
}

function isTestFile(repoPath: string): boolean {
    return /\.test\./.test(repoPath)
}

export function evaluateTouchedBudgetEntries(entries: readonly TouchedBudgetEntry[]): NewCodeGateResult {
    const violations: NewCodeViolation[] = []

    for (const entry of entries) {
        const limit = entry.isTestFile ? testLineLimit : sourceLineLimit
        const allowlist = entry.isTestFile ? testLineBudgetAllowlist : sourceLineBudgetAllowlist
        if (!allowlist.has(entry.file)) {
            continue
        }

        if (entry.currentLines <= limit) {
            continue
        }

        if (entry.currentLines > entry.baselineLines) {
            violations.push({
                file: entry.file,
                rule: entry.isTestFile ? 'oversized-test-grew' : 'oversized-source-grew',
                message: `allowlisted oversized file grew from ${entry.baselineLines} to ${entry.currentLines} lines`,
            })
        }

        if (entry.isTestFile) {
            continue
        }
    }

    for (const entry of entries) {
        if (entry.isTestFile) {
            continue
        }

        if (entry.currentGovernanceMetrics.typedAnyRefs > entry.baselineGovernanceMetrics.typedAnyRefs) {
            violations.push({
                file: entry.file,
                rule: 'typed-any-grew',
                message: `typed any refs grew from ${entry.baselineGovernanceMetrics.typedAnyRefs} to ${entry.currentGovernanceMetrics.typedAnyRefs}`,
            })
        }

        for (const { metricName, rule } of governanceGrowthRules) {
            if (entry.currentGovernanceMetrics[metricName] > entry.baselineGovernanceMetrics[metricName]) {
                violations.push({
                    file: entry.file,
                    rule,
                    message: `${metricName} grew from ${entry.baselineGovernanceMetrics[metricName]} to ${entry.currentGovernanceMetrics[metricName]}`,
                })
            }
        }
    }

    const lines: string[] = []
    lines.push('# Harness New Code Gate')
    lines.push('')
    lines.push(`- Inspected files: ${entries.length}`)
    lines.push(`- Violations: ${violations.length}`)
    if (violations.length === 0) {
        lines.push('- Status: PASS')
    } else {
        lines.push('- Status: FAIL')
        lines.push('')
        for (const violation of violations) {
            lines.push(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
    }

    return {
        inspectedFiles: entries.map((entry) => entry.file),
        violations,
        markdown: lines.join('\n'),
    }
}

export function runNewCodeGate(options?: {
    scopeSpec?: string | null
    touchedPaths?: readonly string[]
}): NewCodeGateResult {
    const touchedPaths = [...(options?.touchedPaths ?? collectTouchedPathsFromGit())]
    const scopedModules = resolveScopedModules({
        scopeSpec: options?.scopeSpec,
        touchedPaths,
    })
    const filteredTouchedPaths = options?.scopeSpec
        ? touchedPaths.filter((path) => isScopedPath(path, scopedModules))
        : touchedPaths

    const entries: TouchedBudgetEntry[] = []
    for (const repoPath of filteredTouchedPaths) {
        if (!existsSync(join(repoRoot, repoPath)) || !isAuditedSourcePath(repoPath)) {
            continue
        }

        const currentContent = readFileSync(join(repoRoot, repoPath), 'utf8')
        const currentLines = countLines(currentContent)
        const baselineContent = readHeadFile(repoPath)
        entries.push({
            file: repoPath,
            baselineLines: baselineContent ? countLines(baselineContent) : 0,
            currentLines,
            isTestFile: isTestFile(repoPath),
            baselineGovernanceMetrics: baselineContent
                ? collectGovernanceSourceMetrics(repoPath, baselineContent)
                : collectGovernanceSourceMetrics(repoPath, ''),
            currentGovernanceMetrics: collectGovernanceSourceMetrics(repoPath, currentContent),
        })
    }

    const result = evaluateTouchedBudgetEntries(entries)
    const scopeDescription = describeScopedModules(scopedModules, {
        scopeSpec: options?.scopeSpec,
        touchedPaths,
    })
    result.markdown = `${result.markdown}\n- Scope: ${scopeDescription}`
    return result
}

function main(): void {
    const result = runNewCodeGate({
        scopeSpec: process.env.VIBY_HARNESS_SCOPE,
    })

    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(artifactDir, 'latest.md'), `${result.markdown}\n`)

    if (result.violations.length > 0) {
        console.error('[harness] new-code gate failed:')
        for (const violation of result.violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[harness] new-code gate passed')
}

if (import.meta.main) {
    main()
}
