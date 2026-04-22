import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceLineLimit, sourceSoftLineLimit, styleLineLimit, testLineLimit } from './lineBudgetConfig'

type ModuleName = 'web' | 'hub' | 'cli' | 'desktop' | 'pairing' | 'shared'

type ModuleConfig = {
    name: ModuleName
    sourceDir: string
    readmePath: string | null
    agentsPath: string | null
}

type TopFile = {
    file: string
    lines: number
}

export type ModuleAuditMetrics = {
    module: ModuleName
    sourceFiles: number
    testFiles: number
    styleFiles: number
    sourceLines: number
    testLines: number
    styleLines: number
    softOversizedSourceFiles: number
    softOversizedSourceExcessLines: number
    oversizedSourceFiles: number
    oversizedSourceExcessLines: number
    oversizedTestFiles: number
    oversizedStyleFiles: number
    oversizedStyleExcessLines: number
    useMemoCalls: number
    useCallbackCalls: number
    storageFiles: number
    storageRefs: number
    queryOwnerExceptionFiles: number
    queryOwnerExceptionRefs: number
    mutationOwnerExceptionFiles: number
    mutationOwnerExceptionRefs: number
    sessionFoundFiles: number
    sessionFoundRefs: number
    legacyCompatFiles: number
    legacyCompatRefs: number
    criticalOwnerHotspotFiles: number
    criticalOwnerExcessLines: number
    webBudgetFailingBudgets: number
    webBudgetMissingBudgets: number
    webLargestAssetGzipBytes: number | null
    hasReadme: boolean
    hasAgents: boolean
    topSourceFiles: TopFile[]
    topStyleFiles: TopFile[]
}

export type ModuleAuditScore = {
    codeHealth: number
    collaborationReadiness: number
    bands: {
        codeHealth: 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement'
        collaborationReadiness: 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement'
    }
    penalties: {
        complexity: number
        reliability: number
        maintainability: number
        verification: number
        recoverability: number
    }
    derived: {
        testToSourceRatio: number
        memoDensityPerKloc: number
    }
}

export type ModuleAuditResult = {
    metrics: ModuleAuditMetrics
    score: ModuleAuditScore
}

export type QualityBaselineModule = {
    module: ModuleName
    codeHealth: number
    collaborationReadiness: number
    penalties: ModuleAuditScore['penalties']
    metrics: Pick<
        ModuleAuditMetrics,
        | 'oversizedSourceFiles'
        | 'oversizedSourceExcessLines'
        | 'oversizedTestFiles'
        | 'storageFiles'
        | 'queryOwnerExceptionFiles'
        | 'mutationOwnerExceptionFiles'
        | 'legacyCompatFiles'
        | 'sessionFoundRefs'
    > & {
        testToSourceRatio: number
        memoDensityPerKloc: number
    }
}

export type QualityBaselineSnapshot = {
    version: 1
    generatedAt: string
    modules: QualityBaselineModule[]
}

export type QualityTrendSnapshot = {
    generatedAt: string
    modules: Array<{
        module: ModuleName
        codeHealth: number
        collaborationReadiness: number
    }>
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
export const qualityArtifactDir = join(repoRoot, '.artifacts/harness/quality')
export const qualityBaselinePath = join(repoRoot, 'docs/internal/quality-baseline.json')
const qualityHistoryDir = join(qualityArtifactDir, 'history')
const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css'])
const moduleConfigs: readonly ModuleConfig[] = [
    { name: 'web', sourceDir: 'web/src', readmePath: 'web/README.md', agentsPath: 'web/AGENTS.md' },
    { name: 'hub', sourceDir: 'hub/src', readmePath: 'hub/README.md', agentsPath: 'hub/AGENTS.md' },
    { name: 'cli', sourceDir: 'cli/src', readmePath: 'cli/README.md', agentsPath: 'cli/AGENTS.md' },
    { name: 'desktop', sourceDir: 'desktop/src', readmePath: 'desktop/README.md', agentsPath: 'desktop/AGENTS.md' },
    { name: 'pairing', sourceDir: 'pairing/src', readmePath: 'pairing/README.md', agentsPath: 'pairing/AGENTS.md' },
    { name: 'shared', sourceDir: 'shared/src', readmePath: 'shared/README.md', agentsPath: 'shared/AGENTS.md' },
]
const queryHookPattern = /\b(useQuery|useInfiniteQuery|useQueries|useSuspenseQuery|useSuspenseInfiniteQuery)\s*\(/g
const mutationHookPattern = /\buseMutation\s*\(/g
const memoPattern = /\buseMemo\s*\(/g
const callbackPattern = /\buseCallback\s*\(/g
const storagePattern = /\b(localStorage|sessionStorage)\b/g
const onSessionFoundPattern = /\bonSessionFound\s*[(:]/g
const legacyCompatPattern =
    /\bLEGACY_[A-Z0-9_]+\b|metadata\.flavor|\bstartedFromRunner\b|\b(?:claudeSessionId|codexSessionId|geminiSessionId|opencodeSessionId|cursorSessionId|piSessionId)\b\s*:|['"]viby-lang['"]/g
const webBuildMetricsPath = join(repoRoot, 'web/.artifacts/build-metrics/build-metrics.json')
const legacyCompatIgnoreFiles = new Set([
    'cli/src/cursor/cursorRemoteLauncher.ts',
    'shared/src/schemas.ts',
    'shared/src/sessionMetadataConstants.ts',
    'hub/src/store/storeSchemaDefinition.ts',
    'hub/src/store/storeSchemaSupport.ts',
])

function isCriticalOwnerFile(moduleName: ModuleName, repoPath: string): boolean {
    switch (moduleName) {
        case 'web':
            return (
                repoPath.startsWith('web/src/routes/sessions/') ||
                repoPath.startsWith('web/src/components/AssistantChat/') ||
                repoPath.startsWith('web/src/hooks/queries/') ||
                repoPath === 'web/src/router.tsx' ||
                repoPath === 'web/src/lib/assistant-runtime.ts'
            )
        case 'hub':
            return (
                repoPath.startsWith('hub/src/sync/') ||
                repoPath.startsWith('hub/src/store/') ||
                repoPath.startsWith('hub/src/web/routes/')
            )
        case 'cli':
            return (
                repoPath.startsWith('cli/src/runner/') ||
                repoPath.startsWith('cli/src/api/') ||
                /^cli\/src\/(?:claude|codex|cursor|gemini|opencode|pi)\/(?:run.*|.*Launcher.*|session\.ts)$/.test(
                    repoPath
                )
            )
        case 'desktop':
            return repoPath.startsWith('desktop/src/hooks/') || repoPath === 'desktop/src/App.tsx'
        case 'shared':
            return repoPath.startsWith('shared/src/session') || repoPath === 'shared/src/schemas.ts'
        case 'pairing':
            return (
                repoPath === 'pairing/src/http.ts' ||
                repoPath === 'pairing/src/ws.ts' ||
                repoPath === 'pairing/src/server.ts' ||
                repoPath === 'pairing/src/store.ts'
            )
    }
}

function readWebBuildMetricsSummary(): Pick<
    ModuleAuditMetrics,
    'webBudgetFailingBudgets' | 'webBudgetMissingBudgets' | 'webLargestAssetGzipBytes'
> {
    if (!existsSync(webBuildMetricsPath)) {
        return {
            webBudgetFailingBudgets: 0,
            webBudgetMissingBudgets: 0,
            webLargestAssetGzipBytes: null,
        }
    }

    const parsed = JSON.parse(readFileSync(webBuildMetricsPath, 'utf8')) as {
        topAssets?: Array<{ gzipBytes?: number }>
        budgetResults?: Array<{ status?: string }>
    }
    const topAssets = parsed.topAssets ?? []
    const budgetResults = parsed.budgetResults ?? []

    return {
        webBudgetFailingBudgets: budgetResults.filter((result) => result.status === 'fail').length,
        webBudgetMissingBudgets: budgetResults.filter((result) => result.status === 'missing').length,
        webLargestAssetGzipBytes: topAssets.reduce<number | null>((largest, asset) => {
            const gzipBytes = typeof asset.gzipBytes === 'number' ? asset.gzipBytes : null
            if (gzipBytes === null) {
                return largest
            }
            return largest === null || gzipBytes > largest ? gzipBytes : largest
        }, null),
    }
}

function walkFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
                continue
            }
            results.push(...walkFiles(fullPath))
            continue
        }
        if (scanExtensions.has(extname(entry.name))) {
            results.push(fullPath)
        }
    }
    return results
}

function countMatches(source: string, pattern: RegExp): number {
    return [...source.matchAll(pattern)].length
}

function toRepoPath(path: string): string {
    return relative(repoRoot, path)
}

function isTestFile(repoPath: string): boolean {
    return /\.test\./.test(repoPath)
}

function isStyleFile(repoPath: string): boolean {
    return extname(repoPath) === '.css'
}

function fileStartsWithPrefix(repoPath: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => repoPath.startsWith(prefix))
}

export function collectModuleAuditMetrics(config: ModuleConfig): ModuleAuditMetrics {
    const sourceDir = join(repoRoot, config.sourceDir)
    const topSourceFiles: TopFile[] = []
    const topStyleFiles: TopFile[] = []
    const metrics: ModuleAuditMetrics = {
        module: config.name,
        sourceFiles: 0,
        testFiles: 0,
        styleFiles: 0,
        sourceLines: 0,
        testLines: 0,
        styleLines: 0,
        softOversizedSourceFiles: 0,
        softOversizedSourceExcessLines: 0,
        oversizedSourceFiles: 0,
        oversizedSourceExcessLines: 0,
        oversizedTestFiles: 0,
        oversizedStyleFiles: 0,
        oversizedStyleExcessLines: 0,
        useMemoCalls: 0,
        useCallbackCalls: 0,
        storageFiles: 0,
        storageRefs: 0,
        queryOwnerExceptionFiles: 0,
        queryOwnerExceptionRefs: 0,
        mutationOwnerExceptionFiles: 0,
        mutationOwnerExceptionRefs: 0,
        sessionFoundFiles: 0,
        sessionFoundRefs: 0,
        legacyCompatFiles: 0,
        legacyCompatRefs: 0,
        criticalOwnerHotspotFiles: 0,
        criticalOwnerExcessLines: 0,
        webBudgetFailingBudgets: 0,
        webBudgetMissingBudgets: 0,
        webLargestAssetGzipBytes: null,
        hasReadme: config.readmePath ? existsSync(join(repoRoot, config.readmePath)) : false,
        hasAgents: config.agentsPath ? existsSync(join(repoRoot, config.agentsPath)) : false,
        topSourceFiles,
        topStyleFiles,
    }

    for (const file of walkFiles(sourceDir)) {
        const repoPath = toRepoPath(file)
        const content = readFileSync(file, 'utf8')
        const lineCount = content.split(/\r?\n/).length
        const testFile = isTestFile(repoPath)
        const styleFile = isStyleFile(repoPath)

        if (testFile) {
            metrics.testFiles += 1
            metrics.testLines += lineCount
            if (lineCount > testLineLimit) {
                metrics.oversizedTestFiles += 1
            }
            continue
        }

        if (styleFile) {
            metrics.styleFiles += 1
            metrics.styleLines += lineCount
            topStyleFiles.push({ file: repoPath, lines: lineCount })
            if (lineCount > styleLineLimit) {
                metrics.oversizedStyleFiles += 1
                metrics.oversizedStyleExcessLines += lineCount - styleLineLimit
            }
            continue
        }

        metrics.sourceFiles += 1
        metrics.sourceLines += lineCount
        topSourceFiles.push({ file: repoPath, lines: lineCount })

        if (lineCount > sourceSoftLineLimit) {
            metrics.softOversizedSourceFiles += 1
            metrics.softOversizedSourceExcessLines += lineCount - sourceSoftLineLimit
        }

        if (lineCount > sourceLineLimit) {
            metrics.oversizedSourceFiles += 1
            metrics.oversizedSourceExcessLines += lineCount - sourceLineLimit
            if (isCriticalOwnerFile(config.name, repoPath)) {
                metrics.criticalOwnerHotspotFiles += 1
                metrics.criticalOwnerExcessLines += lineCount - sourceLineLimit
            }
        }

        const useMemoCalls = countMatches(content, memoPattern)
        const useCallbackCalls = countMatches(content, callbackPattern)
        const storageRefs = config.name === 'web' ? countMatches(content, storagePattern) : 0
        const sessionFoundRefs = countMatches(content, onSessionFoundPattern)
        const legacyCompatRefs = legacyCompatIgnoreFiles.has(repoPath) ? 0 : countMatches(content, legacyCompatPattern)
        const queryOwnerExceptionRefs =
            config.name === 'web' && !fileStartsWithPrefix(repoPath, ['web/src/hooks/queries/'])
                ? countMatches(content, queryHookPattern)
                : 0
        const mutationOwnerExceptionRefs =
            config.name === 'web' && !fileStartsWithPrefix(repoPath, ['web/src/hooks/mutations/'])
                ? countMatches(content, mutationHookPattern)
                : 0

        metrics.useMemoCalls += useMemoCalls
        metrics.useCallbackCalls += useCallbackCalls

        if (storageRefs > 0) {
            metrics.storageFiles += 1
            metrics.storageRefs += storageRefs
        }

        if (sessionFoundRefs > 0) {
            metrics.sessionFoundFiles += 1
            metrics.sessionFoundRefs += sessionFoundRefs
        }

        if (legacyCompatRefs > 0) {
            metrics.legacyCompatFiles += 1
            metrics.legacyCompatRefs += legacyCompatRefs
        }

        if (queryOwnerExceptionRefs > 0) {
            metrics.queryOwnerExceptionFiles += 1
            metrics.queryOwnerExceptionRefs += queryOwnerExceptionRefs
        }

        if (mutationOwnerExceptionRefs > 0) {
            metrics.mutationOwnerExceptionFiles += 1
            metrics.mutationOwnerExceptionRefs += mutationOwnerExceptionRefs
        }
    }

    metrics.topSourceFiles.sort((left, right) => right.lines - left.lines)
    metrics.topSourceFiles.splice(3)
    metrics.topStyleFiles.sort((left, right) => right.lines - left.lines)
    metrics.topStyleFiles.splice(3)
    if (config.name === 'web') {
        Object.assign(metrics, readWebBuildMetricsSummary())
    }
    return metrics
}

export function computeModuleAuditScore(metrics: ModuleAuditMetrics): ModuleAuditScore {
    const testToSourceRatio = metrics.sourceLines === 0 ? 1 : metrics.testLines / metrics.sourceLines
    const memoDensityPerKloc =
        metrics.sourceLines === 0
            ? 0
            : ((metrics.useMemoCalls + metrics.useCallbackCalls) / metrics.sourceLines) * 1_000

    const complexityPenalty = Math.min(
        26,
        Math.round(
            metrics.oversizedSourceFiles * 1.5 +
                Math.ceil(metrics.oversizedSourceExcessLines / 1_200) +
                metrics.oversizedTestFiles * 2
        )
    )
    const reliabilityPenalty = Math.min(
        16,
        Math.round(
            metrics.legacyCompatFiles * 1.5 +
                metrics.queryOwnerExceptionFiles * 4 +
                metrics.mutationOwnerExceptionFiles * 4 +
                Math.ceil(metrics.sessionFoundRefs / 15)
        )
    )
    const maintainabilityPenalty = Math.min(
        12,
        Math.max(0, metrics.storageFiles - 6) + Math.max(0, Math.ceil(memoDensityPerKloc - 6))
    )
    const verificationPenalty = testToSourceRatio < 0.2 ? 6 : testToSourceRatio < 0.35 ? 3 : 0
    const recoverabilityPenalty = (metrics.hasReadme ? 0 : 4) + (metrics.hasAgents ? 0 : 4)
    const codeHealth = Math.max(
        0,
        100 - complexityPenalty - reliabilityPenalty - maintainabilityPenalty - verificationPenalty
    )
    const collaborationReadiness = Math.max(0, 100 - recoverabilityPenalty)

    return {
        codeHealth,
        collaborationReadiness,
        bands: {
            codeHealth: classifyBand(codeHealth),
            collaborationReadiness: classifyBand(collaborationReadiness),
        },
        penalties: {
            complexity: complexityPenalty,
            reliability: reliabilityPenalty,
            maintainability: maintainabilityPenalty,
            verification: verificationPenalty,
            recoverability: recoverabilityPenalty,
        },
        derived: {
            testToSourceRatio,
            memoDensityPerKloc,
        },
    }
}

export function runQualityAudit(): ModuleAuditResult[] {
    return moduleConfigs.map((config) => {
        const metrics = collectModuleAuditMetrics(config)
        return {
            metrics,
            score: computeModuleAuditScore(metrics),
        }
    })
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

function formatKiB(value: number): string {
    return `${(value / 1024).toFixed(2)} KiB`
}

function classifyBand(score: number): 'Excellent' | 'Good' | 'Fair' | 'Needs Improvement' {
    if (score >= 90) {
        return 'Excellent'
    }
    if (score >= 80) {
        return 'Good'
    }
    if (score >= 60) {
        return 'Fair'
    }
    return 'Needs Improvement'
}

function buildFocusSignals(result: ModuleAuditResult): string[] {
    const criticalOwnerSignal = `critical owner excess ${result.metrics.criticalOwnerExcessLines}`
    switch (result.metrics.module) {
        case 'web':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `oversized style files ${result.metrics.oversizedStyleFiles}`,
                `build budget fails ${result.metrics.webBudgetFailingBudgets}`,
                `storage owner files ${result.metrics.storageFiles}`,
                `memo density ${result.score.derived.memoDensityPerKloc.toFixed(2)} / KLOC`,
                `largest asset gzip ${result.metrics.webLargestAssetGzipBytes === null ? 'n/a' : formatKiB(result.metrics.webLargestAssetGzipBytes)}`,
            ]
        case 'hub':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `oversized source files ${result.metrics.oversizedSourceFiles}`,
                `legacy compatibility files ${result.metrics.legacyCompatFiles}`,
            ]
        case 'cli':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `oversized source files ${result.metrics.oversizedSourceFiles}`,
                `onSessionFound refs ${result.metrics.sessionFoundRefs}`,
                `legacy compatibility files ${result.metrics.legacyCompatFiles}`,
            ]
        case 'desktop':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `test/source ${(result.score.derived.testToSourceRatio * 100).toFixed(1)}%`,
                `memo density ${result.score.derived.memoDensityPerKloc.toFixed(2)} / KLOC`,
            ]
        case 'pairing':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `oversized source files ${result.metrics.oversizedSourceFiles}`,
                `test/source ${(result.score.derived.testToSourceRatio * 100).toFixed(1)}%`,
            ]
        case 'shared':
            return [
                criticalOwnerSignal,
                `soft oversized source files ${result.metrics.softOversizedSourceFiles}`,
                `legacy compatibility files ${result.metrics.legacyCompatFiles}`,
                `oversized source files ${result.metrics.oversizedSourceFiles}`,
            ]
    }
}

function createQualityTrendSnapshot(
    results: readonly ModuleAuditResult[],
    generatedAt: string = new Date().toISOString()
): QualityTrendSnapshot {
    return {
        generatedAt,
        modules: results.map((result) => ({
            module: result.metrics.module,
            codeHealth: result.score.codeHealth,
            collaborationReadiness: result.score.collaborationReadiness,
        })),
    }
}

function serializeTrendModules(snapshot: QualityTrendSnapshot): string {
    return JSON.stringify(snapshot.modules)
}

function readQualityHistory(): QualityTrendSnapshot[] {
    if (!existsSync(qualityHistoryDir)) {
        return []
    }

    return readdirSync(qualityHistoryDir)
        .filter((entry) => entry.endsWith('.json'))
        .sort()
        .map((entry) => JSON.parse(readFileSync(join(qualityHistoryDir, entry), 'utf8')) as QualityTrendSnapshot)
}

function historyFileName(generatedAt: string): string {
    return `${generatedAt.replace(/[:.]/g, '-').replace('T', '_')}.json`
}

function formatTrendTimestamp(value: string): string {
    return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

export function formatTrendMarkdown(history: readonly QualityTrendSnapshot[]): string {
    const lines: string[] = []
    lines.push('# Harness Quality Trend')
    lines.push('')

    if (history.length === 0) {
        lines.push('- No history snapshots yet.')
        return lines.join('\n')
    }

    const recent = history.slice(-10)
    const earliest = recent[0]
    const latest = recent[recent.length - 1]
    lines.push(`- Snapshots tracked: ${history.length}`)
    lines.push(`- Window: ${formatTrendTimestamp(earliest.generatedAt)} -> ${formatTrendTimestamp(latest.generatedAt)}`)
    lines.push('')
    lines.push('| 模块 | 最新代码健康分 | 与窗口起点差值 | 最新协作恢复分 | 与窗口起点差值 |')
    lines.push('| --- | ---: | ---: | ---: | ---: |')
    for (const latestModule of latest.modules) {
        const earliestModule = earliest.modules.find((entry) => entry.module === latestModule.module)
        if (!earliestModule) {
            continue
        }
        const codeDelta = latestModule.codeHealth - earliestModule.codeHealth
        const collaborationDelta = latestModule.collaborationReadiness - earliestModule.collaborationReadiness
        lines.push(
            `| \`${latestModule.module}\` | ${latestModule.codeHealth} | ${codeDelta >= 0 ? '+' : ''}${codeDelta} | ${latestModule.collaborationReadiness} | ${collaborationDelta >= 0 ? '+' : ''}${collaborationDelta} |`
        )
    }
    return lines.join('\n')
}

export function formatAuditMarkdown(results: readonly ModuleAuditResult[]): string {
    const lines: string[] = []
    lines.push('# Harness Quality Audit')
    lines.push('')
    lines.push('> Generated by `bun run harness:quality`.')
    lines.push('')
    lines.push(
        '> Best practice: code health and collaboration readiness are reported separately; performance budgets stay in dedicated build gates.'
    )
    lines.push('')
    lines.push(
        '| 模块 | 代码健康分 | 协作恢复分 | 源文件 | 超预算源码文件 | 测试/源码比 | 关键 owner 例外 | 兼容链文件 |'
    )
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    for (const result of results) {
        const ownerExceptions = result.metrics.queryOwnerExceptionFiles + result.metrics.mutationOwnerExceptionFiles
        lines.push(
            `| \`${result.metrics.module}\` | ${result.score.codeHealth} | ${result.score.collaborationReadiness} | ${result.metrics.sourceFiles} | ${result.metrics.oversizedSourceFiles} | ${formatPercent(result.score.derived.testToSourceRatio)} | ${ownerExceptions} | ${result.metrics.legacyCompatFiles} |`
        )
    }
    lines.push('')
    for (const result of results) {
        lines.push(`## ${result.metrics.module}`)
        lines.push('')
        lines.push(`- Code health: ${result.score.codeHealth} (${result.score.bands.codeHealth})`)
        lines.push(
            `- Collaboration readiness: ${result.score.collaborationReadiness} (${result.score.bands.collaborationReadiness})`
        )
        lines.push(
            `- Penalties: complexity ${result.score.penalties.complexity}, reliability ${result.score.penalties.reliability}, maintainability ${result.score.penalties.maintainability}, verification ${result.score.penalties.verification}, recoverability ${result.score.penalties.recoverability}`
        )
        lines.push(
            `- Raw metrics: soft oversized source ${result.metrics.softOversizedSourceFiles}, soft oversized excess ${result.metrics.softOversizedSourceExcessLines}, oversized source ${result.metrics.oversizedSourceFiles}, oversized excess ${result.metrics.oversizedSourceExcessLines}, oversized styles ${result.metrics.oversizedStyleFiles}, style excess ${result.metrics.oversizedStyleExcessLines}, critical owner hotspots ${result.metrics.criticalOwnerHotspotFiles}, critical owner excess ${result.metrics.criticalOwnerExcessLines}, storage files ${result.metrics.storageFiles}, query exceptions ${result.metrics.queryOwnerExceptionFiles}, mutation exceptions ${result.metrics.mutationOwnerExceptionFiles}, legacy files ${result.metrics.legacyCompatFiles}, onSessionFound refs ${result.metrics.sessionFoundRefs}`
        )
        if (result.metrics.module === 'web') {
            lines.push(
                `- Web budget summary: failing budgets ${result.metrics.webBudgetFailingBudgets}, missing budgets ${result.metrics.webBudgetMissingBudgets}, largest asset gzip ${result.metrics.webLargestAssetGzipBytes === null ? 'n/a' : `${(result.metrics.webLargestAssetGzipBytes / 1024).toFixed(2)} KiB`}`
            )
        }
        lines.push(
            `- Derived metrics: test/source ${formatPercent(result.score.derived.testToSourceRatio)}, memo density ${result.score.derived.memoDensityPerKloc.toFixed(2)} / KLOC`
        )
        lines.push(`- Focus signals: ${buildFocusSignals(result).join(', ')}`)
        lines.push('- Largest files:')
        for (const file of result.metrics.topSourceFiles) {
            lines.push(`  - ${file.lines} lines — ${file.file}`)
        }
        if (result.metrics.topStyleFiles.length > 0) {
            lines.push('- Largest style files:')
            for (const file of result.metrics.topStyleFiles) {
                lines.push(`  - ${file.lines} lines — ${file.file}`)
            }
        }
        lines.push('')
    }
    return lines.join('\n')
}

export function createQualityBaselineSnapshot(
    results: readonly ModuleAuditResult[],
    generatedAt: string = new Date().toISOString()
): QualityBaselineSnapshot {
    return {
        version: 1,
        generatedAt,
        modules: results.map((result) => ({
            module: result.metrics.module,
            codeHealth: result.score.codeHealth,
            collaborationReadiness: result.score.collaborationReadiness,
            penalties: result.score.penalties,
            metrics: {
                oversizedSourceFiles: result.metrics.oversizedSourceFiles,
                oversizedSourceExcessLines: result.metrics.oversizedSourceExcessLines,
                oversizedTestFiles: result.metrics.oversizedTestFiles,
                storageFiles: result.metrics.storageFiles,
                queryOwnerExceptionFiles: result.metrics.queryOwnerExceptionFiles,
                mutationOwnerExceptionFiles: result.metrics.mutationOwnerExceptionFiles,
                legacyCompatFiles: result.metrics.legacyCompatFiles,
                sessionFoundRefs: result.metrics.sessionFoundRefs,
                testToSourceRatio: result.score.derived.testToSourceRatio,
                memoDensityPerKloc: result.score.derived.memoDensityPerKloc,
            },
        })),
    }
}

export function writeQualityArtifacts(results: readonly ModuleAuditResult[]): void {
    mkdirSync(qualityArtifactDir, { recursive: true })
    writeFileSync(join(qualityArtifactDir, 'latest.json'), JSON.stringify(results, null, 2))
    writeFileSync(join(qualityArtifactDir, 'latest.md'), formatAuditMarkdown(results))
    mkdirSync(qualityHistoryDir, { recursive: true })

    const nextHistory = createQualityTrendSnapshot(results)
    const history = readQualityHistory()
    const latestHistory = history.at(-1)
    if (!latestHistory || serializeTrendModules(latestHistory) !== serializeTrendModules(nextHistory)) {
        writeFileSync(
            join(qualityHistoryDir, historyFileName(nextHistory.generatedAt)),
            JSON.stringify(nextHistory, null, 2)
        )
    }

    const refreshedHistory = readQualityHistory()
    while (refreshedHistory.length > 30) {
        const oldest = refreshedHistory.shift()
        if (!oldest) {
            break
        }
        rmSync(join(qualityHistoryDir, historyFileName(oldest.generatedAt)), { force: true })
    }

    const finalHistory = readQualityHistory()
    writeFileSync(join(qualityArtifactDir, 'trend.md'), formatTrendMarkdown(finalHistory))
    writeFileSync(join(qualityArtifactDir, 'trend.json'), JSON.stringify(finalHistory.slice(-10), null, 2))
}

if (import.meta.main) {
    const results = runQualityAudit()
    writeQualityArtifacts(results)
    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(results, null, 2))
    } else {
        console.log(formatAuditMarkdown(results))
    }
}
