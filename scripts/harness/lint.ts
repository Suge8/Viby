import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactDirName, isGeneratedArtifactPath } from './generatedArtifactPaths'
import {
    scanExtensions,
    sourceLineBudgetAllowlist,
    sourceLineLimit,
    testLineBudgetAllowlist,
    testLineLimit,
} from './lineBudgetConfig'
import { collectRootWorkspaceRouteViolations } from './routerOwnershipSupport'
import { extractImportSpecifiers, listQualityScoreModules, parseDebtTrackerRows } from './support'

type Violation = {
    rule: string
    file: string
    message: string
}

type BoundaryRule = {
    sourceRoot: string
    forbiddenRoots: string[]
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const requiredPaths = [
    'docs/internal/harness-constitution.md',
    'docs/internal/harness-activity-path.md',
    'docs/internal/browser-observability.md',
    'docs/internal/quality-score.md',
    'docs/internal/tech-debt-tracker.md',
    'docs/internal/harness-standards.md',
    'docs/internal/harness-rollout-playbook.md',
    'docs/development/documentation-authoring.md',
    '.githooks/pre-commit',
    '.githooks/pre-push',
    '.github/dependabot.yml',
    '.github/workflows/harness.yml',
    '.github/pull_request_template.md',
    '.github/copilot-instructions.md',
    '.github/instructions/docs.instructions.md',
    '.github/instructions/web.instructions.md',
    '.github/instructions/cli.instructions.md',
    '.github/instructions/shared.instructions.md',
    '.github/instructions/pairing.instructions.md',
    '.cursor/rules/00-harness-always.mdc',
    '.cursor/rules/docs-harness.mdc',
    '.cursor/rules/web-harness.mdc',
    '.cursor/rules/cli-harness.mdc',
    '.cursor/rules/shared-harness.mdc',
    '.cursor/rules/pairing-harness.mdc',
    'CLAUDE.md',
    'biome.json',
    'pairing/AGENTS.md',
    'scripts/harness/installHooks.ts',
    'scripts/harness/lineBudgetConfig.ts',
    'scripts/harness/lint.ts',
    'scripts/harness/governancePolicy.ts',
    'scripts/harness/routerOwnershipSupport.ts',
    'scripts/harness/styleCheck.ts',
    'scripts/harness/governanceReport.ts',
    'scripts/harness/docGardening.ts',
    'scripts/harness/newCodeGate.ts',
    'scripts/harness/qualityAudit.ts',
    'scripts/harness/qualityBaseline.ts',
    'scripts/harness/qualityGate.ts',
    'scripts/harness/qualityScope.ts',
    'scripts/harness/workspacePolicy.ts',
    'scripts/harness/upstreamLane.ts',
    'scripts/harness/upstreamSupport.ts',
    'scripts/harness/browserSmoke.ts',
    'docs/internal/quality-baseline.json',
    'docs/internal/quality-baseline.md',
]
const requiredRootAgentsPhrases = ['docs/internal/harness-activity-path.md', '.taskmaster/', 'docs/internal/update.md']
const requiredDocsReadmePhrases = [
    'docs/internal/update.md',
    'docs/internal/harness-constitution.md',
    'docs/internal/harness-activity-path.md',
    'docs/internal/browser-observability.md',
    'docs/internal/quality-score.md',
    'docs/internal/tech-debt-tracker.md',
    'docs/internal/harness-standards.md',
    'docs/development/documentation-authoring.md',
]
const localOnlyFiles = [
    'AGENTS.md',
    'hub/AGENTS.md',
    'web/AGENTS.md',
    'desktop/AGENTS.md',
    'pairing/AGENTS.md',
    'docs/README.md',
]
const legacyTaskPathActiveRefRe = /(?:先看|再看|详见|执行细节再看).+\.codex-tasks\//u
const qualityScoreModules = ['web', 'hub', 'cli', 'desktop', 'pairing', 'shared']
const allowedDebtStatuses = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'DEFERRED'])
const boundaryRules: BoundaryRule[] = [
    { sourceRoot: 'web/src', forbiddenRoots: ['hub/', 'cli/', 'desktop/'] },
    { sourceRoot: 'hub/src', forbiddenRoots: ['web/', 'desktop/'] },
    { sourceRoot: 'cli/src', forbiddenRoots: ['web/', 'desktop/'] },
    { sourceRoot: 'desktop/src', forbiddenRoots: ['web/', 'hub/', 'cli/'] },
    { sourceRoot: 'pairing/src', forbiddenRoots: ['web/', 'hub/', 'cli/', 'desktop/', 'shared/'] },
    { sourceRoot: 'shared/src', forbiddenRoots: ['web/', 'hub/', 'cli/', 'desktop/'] },
]
const importBoundaryIgnoreFiles = new Set(['hub/src/web/embeddedAssets.generated.ts'])
const packageScriptRequirements = [
    { path: 'package.json', script: 'build', mustInclude: 'harness:check' },
    { path: 'package.json', script: 'build:single-exe', mustInclude: 'harness:check' },
    { path: 'package.json', script: 'build:single-exe:all', mustInclude: 'harness:check' },
    { path: 'package.json', script: 'build:desktop', mustInclude: 'harness:check' },
    { path: 'web/package.json', script: 'build', mustInclude: 'harness:check' },
    { path: 'hub/package.json', script: 'build', mustInclude: 'harness:check' },
    { path: 'desktop/package.json', script: 'build:web', mustInclude: 'harness:check' },
    { path: 'desktop/package.json', script: 'tauri:build', mustInclude: 'harness:check' },
    { path: 'pairing/package.json', script: 'build', mustInclude: 'harness:check' },
]
const browserStorageOwnerFiles = new Set([
    'web/src/components/AssistantChat/composerDraftLocalStorage.ts',
    'web/src/components/NewSession/preferences.ts',
    'web/src/hooks/useAuth.ts',
    'web/src/hooks/useAuthSource.ts',
    'web/src/hooks/useFontScale.ts',
    'web/src/hooks/usePWAInstall.ts',
    'web/src/hooks/useRecentPaths.ts',
    'web/src/hooks/useServerUrl.ts',
    'web/src/hooks/useTheme.ts',
    'web/src/lib/appRecovery.ts',
    'web/src/lib/browserStorage.ts',
    'web/src/lib/i18n-context.tsx',
    'web/src/lib/recent-skill-usage.ts',
    'web/src/lib/recent-skills.ts',
    'web/src/lib/runtimeAssetRecovery.ts',
])
const useSyncExternalStoreOwnerFiles = new Set([
    'web/src/hooks/useDesktopSessionsLayout.ts',
    'web/src/hooks/useStandaloneDisplayMode.ts',
    'web/src/hooks/useSessionDetailReveal.ts',
    'web/src/hooks/useTheme.ts',
    'web/src/hooks/useOnlineStatus.ts',
    'web/src/hooks/queries/useMessages.ts',
])
const tanstackQueryHookAllowPrefixes = ['web/src/hooks/queries/']
const tanstackQueryHookAllowFiles = new Set(['web/src/routes/sessions/file.tsx'])
const tanstackMutationHookAllowPrefixes = ['web/src/hooks/mutations/']
const queryClientOwnerFiles = new Set(['web/src/lib/query-client.ts'])
const routerOwnerFiles = new Set(['web/src/router.tsx'])
const hookMemoObjectWrapperRoots = ['web/src/hooks/', 'desktop/src/hooks/']
const hookMemoObjectWrapperAllowlist = new Set<string>()

function readText(path: string): string {
    return readFileSync(join(repoRoot, path), 'utf8')
}

function toRepoPath(path: string): string {
    return relative(repoRoot, path) || '.'
}

function addViolation(violations: Violation[], rule: string, file: string, message: string): void {
    violations.push({ rule, file, message })
}

function walkFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true })
    const results: string[] = []

    for (const entry of entries) {
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

function checkRequiredPaths(violations: Violation[]): void {
    for (const file of requiredPaths) {
        if (!existsSync(join(repoRoot, file))) {
            addViolation(violations, 'required-paths', file, 'required harness artifact is missing')
        }
    }
}

function checkLocalOnlyDocs(violations: Violation[]): void {
    for (const file of localOnlyFiles) {
        const content = readText(file)
        if (legacyTaskPathActiveRefRe.test(content)) {
            addViolation(
                violations,
                'activity-path',
                file,
                'legacy .codex-tasks path must not remain in active local docs'
            )
        }
    }

    const rootAgents = readText('AGENTS.md')
    for (const phrase of requiredRootAgentsPhrases) {
        if (!rootAgents.includes(phrase)) {
            addViolation(violations, 'root-agents', 'AGENTS.md', `missing required phrase: ${phrase}`)
        }
    }

    const docsReadme = readText('docs/README.md')
    for (const phrase of requiredDocsReadmePhrases) {
        if (!docsReadme.includes(phrase)) {
            addViolation(violations, 'docs-readme', 'docs/README.md', `missing harness index entry: ${phrase}`)
        }
    }
}

function checkQualityScore(violations: Violation[]): void {
    const modules = new Set(listQualityScoreModules(readText('docs/internal/quality-score.md')))
    for (const moduleName of qualityScoreModules) {
        if (!modules.has(moduleName)) {
            addViolation(
                violations,
                'quality-score',
                'docs/internal/quality-score.md',
                `missing module row: ${moduleName}`
            )
        }
    }
}

function checkDebtTracker(violations: Violation[]): void {
    const rows = parseDebtTrackerRows(readText('docs/internal/tech-debt-tracker.md'))
    const seenIds = new Set<string>()

    for (const row of rows) {
        if (!row.id) {
            addViolation(
                violations,
                'debt-tracker',
                'docs/internal/tech-debt-tracker.md',
                'encountered debt row without id'
            )
            continue
        }
        if (seenIds.has(row.id)) {
            addViolation(
                violations,
                'debt-tracker',
                'docs/internal/tech-debt-tracker.md',
                `duplicate debt id: ${row.id}`
            )
        }
        seenIds.add(row.id)
        if (!allowedDebtStatuses.has(row.status)) {
            addViolation(
                violations,
                'debt-tracker',
                'docs/internal/tech-debt-tracker.md',
                `invalid debt status for ${row.id}: ${row.status}`
            )
        }
    }
}

function checkPackageScripts(violations: Violation[]): void {
    const packageJson = JSON.parse(readText('package.json')) as { scripts?: Record<string, string> }
    const scripts = packageJson.scripts ?? {}
    const requiredScripts = [
        'harness:install-hooks',
        'harness:lint',
        'harness:workspace-policy',
        'harness:style',
        'harness:governance',
        'harness:docs',
        'harness:upstream',
        'harness:upstream:fetch',
        'harness:new-code',
        'harness:quality',
        'harness:quality:baseline',
        'harness:quality:gate',
        'harness:check',
        'harness:browser:smoke',
        'harness:verify',
        'test:scripts',
    ]

    for (const scriptName of requiredScripts) {
        if (!scripts[scriptName]) {
            addViolation(violations, 'package-scripts', 'package.json', `missing script: ${scriptName}`)
        }
    }

    for (const requirement of packageScriptRequirements) {
        const manifest = JSON.parse(readText(requirement.path)) as { scripts?: Record<string, string> }
        const command = manifest.scripts?.[requirement.script]
        if (!command) {
            addViolation(violations, 'build-script', requirement.path, `missing build script ${requirement.script}`)
            continue
        }
        if (!command.includes(requirement.mustInclude)) {
            addViolation(
                violations,
                'build-script',
                requirement.path,
                `${requirement.script} must include ${requirement.mustInclude}`
            )
        }
    }
}

function checkPinnedWebConfigOwners(violations: Violation[]): void {
    const queryClientFile = 'web/src/lib/query-client.ts'
    const queryClientContent = readText(queryClientFile)
    const requiredQueryClientMarkers = [
        'staleTime: 5_000',
        'refetchOnWindowFocus: false',
        'retry: 1',
        'mutations:',
        'retry: 0',
    ]

    for (const marker of requiredQueryClientMarkers) {
        if (!queryClientContent.includes(marker)) {
            addViolation(
                violations,
                'query-client-defaults',
                queryClientFile,
                `query client defaults must keep explicit marker: ${marker}`
            )
        }
    }

    const routerFile = 'web/src/router.tsx'
    const routerContent = readText(routerFile)
    const requiredRouterMarkers = ['scrollRestoration:', 'shouldRestoreWindowScroll']

    for (const marker of requiredRouterMarkers) {
        if (!routerContent.includes(marker)) {
            addViolation(
                violations,
                'router-scroll-owner',
                routerFile,
                `router owner must keep explicit marker: ${marker}`
            )
        }
    }

    for (const violation of collectRootWorkspaceRouteViolations(routerContent)) {
        addViolation(violations, 'router-shell-owner', routerFile, violation)
    }
}

function checkFileLineBudgets(violations: Violation[]): void {
    const roots = ['web/src', 'hub/src', 'cli/src', 'desktop/src', 'pairing/src', 'shared/src']

    for (const root of roots) {
        const sourceDir = join(repoRoot, root)
        if (!existsSync(sourceDir)) {
            continue
        }

        for (const file of walkFiles(sourceDir)) {
            const repoPath = toRepoPath(file)
            if (repoPath === 'hub/src/web/embeddedAssets.generated.ts') {
                continue
            }

            const lineCount = readFileSync(file, 'utf8').split(/\r?\n/).length
            const isTestFile = /\.test\./.test(repoPath)
            const limit = isTestFile ? testLineLimit : sourceLineLimit
            const allowlist = isTestFile ? testLineBudgetAllowlist : sourceLineBudgetAllowlist

            if (lineCount <= limit) {
                continue
            }

            if (!allowlist.has(repoPath)) {
                addViolation(
                    violations,
                    'file-line-budget',
                    repoPath,
                    `${isTestFile ? 'test' : 'source'} file has ${lineCount} lines; limit is ${limit}. Split responsibilities or add an explicit baseline entry.`
                )
            }
        }
    }
}

function checkCrossPackageImports(violations: Violation[]): void {
    for (const rule of boundaryRules) {
        const sourceDir = join(repoRoot, rule.sourceRoot)
        if (!existsSync(sourceDir)) {
            continue
        }

        for (const file of walkFiles(sourceDir)) {
            if (importBoundaryIgnoreFiles.has(toRepoPath(file))) {
                continue
            }
            const content = readFileSync(file, 'utf8')
            const imports = extractImportSpecifiers(content)
            for (const specifier of imports) {
                if (!specifier.startsWith('.')) {
                    continue
                }

                const resolvedImport = resolve(dirname(file), specifier)
                for (const forbiddenRoot of rule.forbiddenRoots) {
                    if (resolvedImport.startsWith(join(repoRoot, forbiddenRoot))) {
                        addViolation(
                            violations,
                            'cross-package-import',
                            toRepoPath(file),
                            `relative import crosses into forbidden root ${forbiddenRoot}: ${specifier}`
                        )
                    }
                }
            }
        }
    }
}

function fileStartsWithPrefix(repoPath: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => repoPath.startsWith(prefix))
}

function checkWebStackOwners(violations: Violation[]): void {
    const webSrcDir = join(repoRoot, 'web/src')
    if (!existsSync(webSrcDir)) {
        return
    }

    for (const file of walkFiles(webSrcDir)) {
        const repoPath = toRepoPath(file)
        const content = readFileSync(file, 'utf8')
        const isTestFile = /\.test\./.test(repoPath) || repoPath.includes('/test/')

        if (isTestFile) {
            continue
        }

        if (/(?:^|[^\w.])(localStorage|sessionStorage)\b/.test(content) && !browserStorageOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'browser-storage-owner',
                repoPath,
                'direct localStorage/sessionStorage access must stay inside approved storage owner files'
            )
        }

        if (content.includes('useSyncExternalStore(') && !useSyncExternalStoreOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'external-store-owner',
                repoPath,
                'useSyncExternalStore must stay inside approved external-store owner files'
            )
        }

        if (content.includes('new QueryClient(') && !queryClientOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'query-client-owner',
                repoPath,
                'new QueryClient must stay inside the single query client owner file'
            )
        }

        const usesQueryHook =
            /(useQuery|useInfiniteQuery|useQueries|useSuspenseQuery|useSuspenseInfiniteQuery)\s*\(/.test(content)
        if (
            usesQueryHook &&
            !fileStartsWithPrefix(repoPath, tanstackQueryHookAllowPrefixes) &&
            !tanstackQueryHookAllowFiles.has(repoPath)
        ) {
            addViolation(
                violations,
                'tanstack-query-owner',
                repoPath,
                'TanStack Query read hooks must live in hooks/queries or an explicitly approved route owner'
            )
        }

        if (/\buseMutation\s*\(/.test(content) && !fileStartsWithPrefix(repoPath, tanstackMutationHookAllowPrefixes)) {
            addViolation(
                violations,
                'tanstack-mutation-owner',
                repoPath,
                'TanStack Query mutation hooks must live in hooks/mutations owners'
            )
        }

        if (
            /\b(createRouter|createRootRoute|createRoute|lazyRouteComponent)\s*\(/.test(content) &&
            !routerOwnerFiles.has(repoPath)
        ) {
            addViolation(
                violations,
                'router-owner',
                repoPath,
                'TanStack Router creation must stay inside the single router owner file'
            )
        }
    }
}

function checkHookMemoWrappers(violations: Violation[]): void {
    const roots = ['web/src', 'desktop/src']

    for (const root of roots) {
        const sourceDir = join(repoRoot, root)
        if (!existsSync(sourceDir)) {
            continue
        }

        for (const file of walkFiles(sourceDir)) {
            const repoPath = toRepoPath(file)
            if (
                !fileStartsWithPrefix(repoPath, hookMemoObjectWrapperRoots) ||
                hookMemoObjectWrapperAllowlist.has(repoPath)
            ) {
                continue
            }

            const content = readFileSync(file, 'utf8')
            if (/return\s+(?:React\.)?useMemo\s*\(\s*\(\)\s*=>\s*\(\{/.test(content)) {
                addViolation(
                    violations,
                    'hook-memo-wrapper',
                    repoPath,
                    'hook return objects must not be wrapped in useMemo unless explicitly allowlisted for a measured performance boundary'
                )
            }
        }
    }
}

function main(): void {
    const violations: Violation[] = []

    checkRequiredPaths(violations)
    checkLocalOnlyDocs(violations)
    checkQualityScore(violations)
    checkDebtTracker(violations)
    checkPackageScripts(violations)
    checkPinnedWebConfigOwners(violations)
    checkFileLineBudgets(violations)
    checkCrossPackageImports(violations)
    checkWebStackOwners(violations)
    checkHookMemoWrappers(violations)

    if (violations.length > 0) {
        console.error(`[harness] ${violations.length} violation(s) found:`)
        for (const violation of violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[harness] structural lint passed')
}

main()
