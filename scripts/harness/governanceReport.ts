import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactDirName, isGeneratedArtifactPath } from './generatedArtifactPaths'
import {
    type ControlHotspotCandidate,
    collectControlHotspotCandidate,
    collectControllerOwnerViolations,
    collectGovernanceSourceMetrics,
    type GovernanceSourceMetrics,
    isSqlOwnerPath,
    isZodOwnerPath,
} from './governancePolicy'
import { sourceLineLimit, testLineLimit } from './lineBudgetConfig'
import { collectTouchedPathsFromGit, describeScopedModules, resolveScopedModules } from './qualityScope'
import { extractImportSpecifiers } from './support'

type GovernanceViolation = {
    rule: string
    file: string
    message: string
}

type GovernanceFileMetrics = GovernanceSourceMetrics & {
    file: string
    lines: number
    isTestFile: boolean
}

type GovernanceHotspot = {
    surface: string
    fileCount: number
    effectRefs: number
    unownedFiles: number
    files: string[]
    graphRoots: number
    graphConflict: boolean
}

type GovernanceAuditResult = {
    summary: {
        scope: string
        filesScanned: number
        typedAnyRefs: number
        rawControlRefs: number
        designMagicRefs: number
        consoleRefs: number
        fireAndForgetRefs: number
        controllerOwnerRefs: number
        unownedControlSurfaceRefs: number
        controlHotspotSurfaces: number
        unownedControlHotspotSurfaces: number
        controlGraphConflictSurfaces: number
        oversizedSourceFiles: number
        oversizedTestFiles: number
    }
    topFiles: {
        typedAny: GovernanceFileMetrics[]
        rawControls: GovernanceFileMetrics[]
        designMagic: GovernanceFileMetrics[]
        console: GovernanceFileMetrics[]
        fireAndForget: GovernanceFileMetrics[]
        controllerOwner: GovernanceFileMetrics[]
        oversizedSource: GovernanceFileMetrics[]
        oversizedTest: GovernanceFileMetrics[]
    }
    topHotspots: GovernanceHotspot[]
    violations: GovernanceViolation[]
    markdown: string
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/harness/governance')
const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const rootByModule = {
    web: 'web/src',
    hub: 'hub/src',
    cli: 'cli/src',
    desktop: 'desktop/src',
    pairing: 'pairing/src',
    shared: 'shared/src',
} as const

function walkFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (
                entry.name === 'node_modules' ||
                entry.name === 'dist' ||
                entry.name === '.git' ||
                isGeneratedArtifactDirName(entry.name)
            ) {
                continue
            }
            results.push(...walkFiles(fullPath))
            continue
        }

        if (scanExtensions.has(extname(entry.name)) && !isGeneratedArtifactPath(toRepoPath(fullPath))) {
            results.push(fullPath)
        }
    }
    return results
}

function toRepoPath(path: string): string {
    return relative(repoRoot, path) || '.'
}

function usesZod(source: string): boolean {
    const hasRuntimeImport =
        /import\s+(?!type\b)[^'"\n]+\bfrom ['"]zod['"]/.test(source) ||
        /from ['"]fastify-type-provider-zod['"]/.test(source)
    const hasSchemaBuilder =
        /\bz\.(?:object|string|number|boolean|enum|nativeEnum|literal|array|record|union|discriminatedUnion|tuple|any|unknown|strictObject|looseObject)\s*\(/.test(
            source
        )
    return hasRuntimeImport && hasSchemaBuilder
}

function usesSqlOwnerPatterns(source: string): boolean {
    return /from ['"]bun:sqlite['"]|\bnew\s+Database\s*\(|\bdb\.prepare\s*\(/.test(source)
}

function rankFiles(
    files: GovernanceFileMetrics[],
    score: (file: GovernanceFileMetrics) => number
): GovernanceFileMetrics[] {
    return [...files]
        .filter((file) => score(file) > 0)
        .sort((left, right) => score(right) - score(left) || left.file.localeCompare(right.file))
        .slice(0, 12)
}

function isTestFile(repoPath: string): boolean {
    return /\.test\./.test(repoPath)
}

function candidateImportTargets(repoPath: string, specifier: string): string[] {
    if (!specifier.startsWith('.')) {
        return []
    }

    const absoluteBase = resolve(repoRoot, dirname(repoPath), specifier)
    const candidates = new Set<string>([
        relative(repoRoot, absoluteBase).replaceAll('\\', '/'),
        relative(repoRoot, `${absoluteBase}.ts`).replaceAll('\\', '/'),
        relative(repoRoot, `${absoluteBase}.tsx`).replaceAll('\\', '/'),
        relative(repoRoot, `${absoluteBase}.js`).replaceAll('\\', '/'),
        relative(repoRoot, `${absoluteBase}.jsx`).replaceAll('\\', '/'),
        relative(repoRoot, join(absoluteBase, 'index.ts')).replaceAll('\\', '/'),
        relative(repoRoot, join(absoluteBase, 'index.tsx')).replaceAll('\\', '/'),
        relative(repoRoot, join(absoluteBase, 'index.js')).replaceAll('\\', '/'),
        relative(repoRoot, join(absoluteBase, 'index.jsx')).replaceAll('\\', '/'),
    ])

    return [...candidates].filter((value) => value.length > 0 && !value.startsWith('..'))
}

function countGraphRoots(files: readonly string[]): number {
    if (files.length <= 1) {
        return files.length
    }

    const fileSet = new Set(files)
    const inboundCounts = new Map<string, number>(files.map((file) => [file, 0]))

    for (const file of files) {
        const source = readFileSync(join(repoRoot, file), 'utf8')
        for (const specifier of extractImportSpecifiers(source)) {
            for (const target of candidateImportTargets(file, specifier)) {
                if (!fileSet.has(target) || target === file) {
                    continue
                }
                inboundCounts.set(target, (inboundCounts.get(target) ?? 0) + 1)
            }
        }
    }

    return [...inboundCounts.values()].filter((count) => count === 0).length
}

function rankHotspots(candidates: readonly Array<ControlHotspotCandidate & { file: string }>): GovernanceHotspot[] {
    const grouped = new Map<string, GovernanceHotspot>()

    for (const candidate of candidates) {
        const existing = grouped.get(candidate.surface)
        if (existing) {
            existing.fileCount += 1
            existing.effectRefs += candidate.effectRefs
            existing.unownedFiles += candidate.explicitOwner ? 0 : 1
            existing.files.push(candidate.file)
            continue
        }

        grouped.set(candidate.surface, {
            surface: candidate.surface,
            fileCount: 1,
            effectRefs: candidate.effectRefs,
            unownedFiles: candidate.explicitOwner ? 0 : 1,
            files: [candidate.file],
            graphRoots: 0,
            graphConflict: false,
        })
    }

    return [...grouped.values()]
        .filter((hotspot) => hotspot.fileCount >= 2)
        .map((hotspot) => {
            const graphRoots = countGraphRoots(hotspot.files)
            return {
                ...hotspot,
                graphRoots,
                graphConflict: hotspot.unownedFiles > 0 && graphRoots > 1,
            }
        })
        .sort(
            (left, right) =>
                Number(right.graphConflict) - Number(left.graphConflict) ||
                right.unownedFiles - left.unownedFiles ||
                right.fileCount - left.fileCount ||
                right.effectRefs - left.effectRefs ||
                left.surface.localeCompare(right.surface)
        )
        .slice(0, 12)
}

export function auditGovernance(options?: {
    scopeSpec?: string | null
    touchedPaths?: readonly string[]
}): GovernanceAuditResult {
    const files: GovernanceFileMetrics[] = []
    const violations: GovernanceViolation[] = []
    const controlHotspotCandidates: Array<ControlHotspotCandidate & { file: string }> = []
    const touchedPaths = [...(options?.touchedPaths ?? collectTouchedPathsFromGit())]
    const scopeModules = resolveScopedModules({
        scopeSpec: options?.scopeSpec,
        touchedPaths,
    })

    for (const [moduleName, root] of Object.entries(rootByModule)) {
        if (!scopeModules.includes(moduleName as keyof typeof rootByModule)) {
            continue
        }
        const absoluteRoot = join(repoRoot, root)
        if (!existsSync(absoluteRoot)) {
            continue
        }

        for (const file of walkFiles(absoluteRoot)) {
            const repoPath = toRepoPath(file)
            if (/\.test\./.test(repoPath) || repoPath.includes('/__fixtures__/')) {
                continue
            }
            const source = readFileSync(file, 'utf8')
            const metrics = collectGovernanceSourceMetrics(repoPath, source)
            const controllerOwnerViolations = collectControllerOwnerViolations(repoPath, source)
            const controlHotspotCandidate = collectControlHotspotCandidate(repoPath, source)
            const lines = source.split(/\r?\n/).length
            files.push({
                file: repoPath,
                lines,
                isTestFile: isTestFile(repoPath),
                ...metrics,
            })

            if (controlHotspotCandidate) {
                controlHotspotCandidates.push({
                    file: repoPath,
                    ...controlHotspotCandidate,
                })
            }

            for (const violation of controllerOwnerViolations) {
                violations.push({
                    rule: violation.rule,
                    file: repoPath,
                    message: violation.message,
                })
            }

            if (usesZod(source) && !isZodOwnerPath(repoPath)) {
                violations.push({
                    rule: 'zod-owner',
                    file: repoPath,
                    message: 'zod/schema creation must stay inside approved boundary/schema owner files',
                })
            }

            if (usesSqlOwnerPatterns(source) && !isSqlOwnerPath(repoPath)) {
                violations.push({
                    rule: 'sql-owner',
                    file: repoPath,
                    message: 'bun:sqlite and db.prepare must stay inside Hub store owners',
                })
            }
        }
    }

    const summary = {
        scope: describeScopedModules(scopeModules, {
            scopeSpec: options?.scopeSpec,
            touchedPaths,
        }),
        filesScanned: files.length,
        typedAnyRefs: files.reduce((total, file) => total + file.typedAnyRefs, 0),
        rawControlRefs: files.reduce(
            (total, file) => total + file.rawButtonRefs + file.rawInputRefs + file.rawTextareaRefs + file.rawSelectRefs,
            0
        ),
        designMagicRefs: files.reduce((total, file) => total + file.designMagicRefs, 0),
        consoleRefs: files.reduce((total, file) => total + file.consoleRefs, 0),
        fireAndForgetRefs: files.reduce((total, file) => total + file.fireAndForgetRefs, 0),
        controllerOwnerRefs: files.reduce((total, file) => total + file.controllerOwnerViolationRefs, 0),
        unownedControlSurfaceRefs: files.reduce((total, file) => total + file.unownedControlSurfaceRefs, 0),
        controlHotspotSurfaces: rankHotspots(controlHotspotCandidates).length,
        unownedControlHotspotSurfaces: rankHotspots(controlHotspotCandidates).filter(
            (hotspot) => hotspot.unownedFiles > 0
        ).length,
        controlGraphConflictSurfaces: rankHotspots(controlHotspotCandidates).filter((hotspot) => hotspot.graphConflict)
            .length,
        oversizedSourceFiles: files.filter((file) => !file.isTestFile && file.lines > sourceLineLimit).length,
        oversizedTestFiles: files.filter((file) => file.isTestFile && file.lines > testLineLimit).length,
    }
    const topHotspots = rankHotspots(controlHotspotCandidates)

    const topFiles = {
        typedAny: rankFiles(files, (file) => file.typedAnyRefs),
        rawControls: rankFiles(
            files,
            (file) => file.rawButtonRefs + file.rawInputRefs + file.rawTextareaRefs + file.rawSelectRefs
        ),
        designMagic: rankFiles(files, (file) => file.designMagicRefs),
        console: rankFiles(files, (file) => file.consoleRefs),
        fireAndForget: rankFiles(files, (file) => file.fireAndForgetRefs),
        controllerOwner: rankFiles(files, (file) => file.controllerOwnerViolationRefs),
        oversizedSource: rankFiles(files, (file) => (!file.isTestFile ? Math.max(file.lines - sourceLineLimit, 0) : 0)),
        oversizedTest: rankFiles(files, (file) => (file.isTestFile ? Math.max(file.lines - testLineLimit, 0) : 0)),
    }

    const lines: string[] = []
    lines.push('# Harness Governance Audit')
    lines.push('')
    lines.push(`- Scope: ${summary.scope}`)
    lines.push(`- Files scanned: ${summary.filesScanned}`)
    lines.push(`- Typed any refs: ${summary.typedAnyRefs}`)
    lines.push(`- Raw control refs: ${summary.rawControlRefs}`)
    lines.push(`- Design magic refs: ${summary.designMagicRefs}`)
    lines.push(`- Console refs: ${summary.consoleRefs}`)
    lines.push(`- Fire-and-forget refs: ${summary.fireAndForgetRefs}`)
    lines.push(`- Controller-owner refs: ${summary.controllerOwnerRefs}`)
    lines.push(`- Unowned control-surface refs: ${summary.unownedControlSurfaceRefs}`)
    lines.push(`- Control hotspot surfaces: ${summary.controlHotspotSurfaces}`)
    lines.push(`- Unowned control hotspot surfaces: ${summary.unownedControlHotspotSurfaces}`)
    lines.push(`- Control graph conflict surfaces: ${summary.controlGraphConflictSurfaces}`)
    lines.push(`- Oversized source files: ${summary.oversizedSourceFiles}`)
    lines.push(`- Oversized test files: ${summary.oversizedTestFiles}`)
    lines.push(`- Structural violations: ${violations.length}`)
    lines.push('')
    lines.push('## Top Typed Any')
    lines.push('')
    for (const file of topFiles.typedAny) {
        lines.push(`- ${file.file}: ${file.typedAnyRefs}`)
    }
    if (topFiles.typedAny.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Raw Controls')
    lines.push('')
    for (const file of topFiles.rawControls) {
        const total = file.rawButtonRefs + file.rawInputRefs + file.rawTextareaRefs + file.rawSelectRefs
        lines.push(`- ${file.file}: ${total}`)
    }
    if (topFiles.rawControls.length === 0) {
        lines.push('- none')
    }
    lines.push('## Top Design Magic')
    lines.push('')
    for (const file of topFiles.designMagic) {
        lines.push(`- ${file.file}: ${file.designMagicRefs}`)
    }
    if (topFiles.designMagic.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Console')
    lines.push('')
    for (const file of topFiles.console) {
        lines.push(`- ${file.file}: ${file.consoleRefs}`)
    }
    if (topFiles.console.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Fire-and-Forget')
    lines.push('')
    for (const file of topFiles.fireAndForget) {
        lines.push(`- ${file.file}: ${file.fireAndForgetRefs}`)
    }
    if (topFiles.fireAndForget.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Controller Owner Drift')
    lines.push('')
    for (const file of topFiles.controllerOwner) {
        lines.push(`- ${file.file}: ${file.controllerOwnerViolationRefs}`)
    }
    if (topFiles.controllerOwner.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Control Surface Hotspots')
    lines.push('')
    for (const hotspot of topHotspots) {
        lines.push(
            `- ${hotspot.surface}: files=${hotspot.fileCount}, effectRefs=${hotspot.effectRefs}, unownedFiles=${hotspot.unownedFiles}, graphRoots=${hotspot.graphRoots}, graphConflict=${hotspot.graphConflict ? 'yes' : 'no'}`
        )
    }
    if (topHotspots.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Oversized Source')
    lines.push('')
    for (const file of topFiles.oversizedSource) {
        lines.push(`- ${file.file}: ${file.lines}`)
    }
    if (topFiles.oversizedSource.length === 0) {
        lines.push('- none')
    }
    lines.push('')
    lines.push('## Top Oversized Test')
    lines.push('')
    for (const file of topFiles.oversizedTest) {
        lines.push(`- ${file.file}: ${file.lines}`)
    }
    if (topFiles.oversizedTest.length === 0) {
        lines.push('- none')
    }

    if (violations.length > 0) {
        lines.push('')
        lines.push('## Structural Violations')
        lines.push('')
        for (const violation of violations) {
            lines.push(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
    }

    return {
        summary,
        topFiles,
        topHotspots,
        violations,
        markdown: lines.join('\n'),
    }
}

function main(): void {
    const result = auditGovernance({
        scopeSpec: process.env.VIBY_HARNESS_SCOPE,
    })
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(artifactDir, 'latest.md'), `${result.markdown}\n`)

    if (result.violations.length > 0) {
        console.error('[harness] governance audit failed:')
        for (const violation of result.violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[harness] governance audit passed')
}

if (import.meta.main) {
    main()
}
