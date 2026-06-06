import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGeneratedArtifactDirName, isGeneratedArtifactPath } from '../lib/generatedArtifactPaths'
import { collectControllerOwnerViolations, isSqlOwnerPath, isZodOwnerPath } from '../lib/governancePolicy'
import { extractImportSpecifiers } from '../lib/support'
import { collectRootWorkspaceRouteViolations } from './routerOwnershipSupport'

type Violation = {
    rule: string
    file: string
    message: string
}

type BoundaryRule = {
    sourceRoot: string
    forbiddenRoots: readonly string[]
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/verify/owners')
const scanExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const sourceRoots = ['web/src', 'hub/src', 'app-core/src', 'desktop/src', 'pairing/src', 'shared/src']
const boundaryRules: readonly BoundaryRule[] = [
    { sourceRoot: 'web/src', forbiddenRoots: ['hub/', 'app-core/', 'desktop/'] },
    { sourceRoot: 'hub/src', forbiddenRoots: ['web/', 'desktop/'] },
    { sourceRoot: 'app-core/src', forbiddenRoots: ['web/', 'desktop/'] },
    { sourceRoot: 'desktop/src', forbiddenRoots: ['web/', 'hub/', 'app-core/'] },
    { sourceRoot: 'pairing/src', forbiddenRoots: ['web/', 'hub/', 'app-core/', 'desktop/', 'shared/'] },
    { sourceRoot: 'shared/src', forbiddenRoots: ['web/', 'hub/', 'app-core/', 'desktop/'] },
]
const importBoundaryIgnoreFiles = new Set(['hub/src/web/embeddedAssets.generated.ts'])
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
    'web/src/lib/runtimeAssetRecovery.ts',
])
const useSyncExternalStoreOwnerFiles = new Set([
    'web/src/hooks/useDesktopSessionsLayout.ts',
    'web/src/hooks/useOnlineStatus.ts',
    'web/src/hooks/useRealtimeRecoveryRuntime.ts',
    'web/src/hooks/useSessionDetailReveal.ts',
    'web/src/hooks/useStandaloneDisplayMode.ts',
    'web/src/hooks/useTheme.ts',
    'web/src/hooks/queries/useMessages.ts',
])
const queryClientOwnerFiles = new Set(['web/src/lib/query-client.ts'])
const sessionsQueryWriteOwnerFiles = new Set([
    'web/src/lib/realtimeEventController.ts',
    'web/src/lib/sessionQueryCache.ts',
])
const tanstackQueryHookAllowFiles = new Set(['web/src/routes/sessions/file.tsx'])
const tanstackQueryHookAllowPrefixes = ['web/src/hooks/queries/']
const tanstackMutationHookAllowPrefixes = ['web/src/hooks/mutations/']
const routerOwnerFiles = new Set(['web/src/router.tsx'])

function toRepoPath(path: string): string {
    return relative(repoRoot, path).replaceAll('\\', '/') || '.'
}

function addViolation(violations: Violation[], rule: string, file: string, message: string): void {
    violations.push({ rule, file, message })
}

function walkFiles(dir: string): string[] {
    const files: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || isGeneratedArtifactDirName(entry.name)) {
                continue
            }
            files.push(...walkFiles(fullPath))
            continue
        }
        if (scanExtensions.has(extname(entry.name)) && !isGeneratedArtifactPath(toRepoPath(fullPath))) {
            files.push(fullPath)
        }
    }
    return files
}

function fileStartsWithPrefix(repoPath: string, prefixes: readonly string[]): boolean {
    return prefixes.some((prefix) => repoPath.startsWith(prefix))
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

function checkCrossPackageImports(violations: Violation[]): void {
    for (const rule of boundaryRules) {
        const sourceDir = join(repoRoot, rule.sourceRoot)
        if (!existsSync(sourceDir)) {
            continue
        }
        for (const file of walkFiles(sourceDir)) {
            const repoPath = toRepoPath(file)
            if (importBoundaryIgnoreFiles.has(repoPath)) {
                continue
            }
            for (const specifier of extractImportSpecifiers(readFileSync(file, 'utf8'))) {
                if (!specifier.startsWith('.')) {
                    continue
                }
                const resolvedImport = resolve(dirname(file), specifier)
                for (const forbiddenRoot of rule.forbiddenRoots) {
                    if (resolvedImport.startsWith(join(repoRoot, forbiddenRoot))) {
                        addViolation(
                            violations,
                            'cross-package-import',
                            repoPath,
                            `relative import crosses into forbidden root ${forbiddenRoot}: ${specifier}`
                        )
                    }
                }
            }
        }
    }
}

function checkSourceOwnerRules(violations: Violation[]): void {
    for (const root of sourceRoots) {
        const sourceDir = join(repoRoot, root)
        if (!existsSync(sourceDir)) {
            continue
        }
        for (const file of walkFiles(sourceDir)) {
            const repoPath = toRepoPath(file)
            if (/\.test\./.test(repoPath) || repoPath.includes('/__fixtures__/')) {
                continue
            }
            const source = readFileSync(file, 'utf8')
            for (const violation of collectControllerOwnerViolations(repoPath, source)) {
                addViolation(violations, violation.rule, repoPath, violation.message)
            }
            if (usesZod(source) && !isZodOwnerPath(repoPath)) {
                addViolation(violations, 'zod-owner', repoPath, 'zod/schema creation must stay inside schema owners')
            }
            if (usesSqlOwnerPatterns(source) && !isSqlOwnerPath(repoPath)) {
                addViolation(violations, 'sql-owner', repoPath, 'SQLite access must stay inside Hub store owners')
            }
        }
    }
}

function checkWebOwnerRules(violations: Violation[]): void {
    const webSrcDir = join(repoRoot, 'web/src')
    if (!existsSync(webSrcDir)) {
        return
    }
    for (const file of walkFiles(webSrcDir)) {
        const repoPath = toRepoPath(file)
        if (/\.test\./.test(repoPath) || repoPath.includes('/test/')) {
            continue
        }
        const source = readFileSync(file, 'utf8')
        if (/(?:^|[^\w.])(localStorage|sessionStorage)\b/.test(source) && !browserStorageOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'browser-storage-owner',
                repoPath,
                'browser storage must stay inside approved owners'
            )
        }
        if (source.includes('useSyncExternalStore(') && !useSyncExternalStoreOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'external-store-owner',
                repoPath,
                'useSyncExternalStore must stay inside approved owners'
            )
        }
        if (source.includes('new QueryClient(') && !queryClientOwnerFiles.has(repoPath)) {
            addViolation(
                violations,
                'query-client-owner',
                repoPath,
                'new QueryClient must stay inside the query client owner'
            )
        }
        if (
            /setQueryData(?:<[^>]+>)?\s*\(\s*queryKeys\.sessions/u.test(source) &&
            !sessionsQueryWriteOwnerFiles.has(repoPath)
        ) {
            addViolation(
                violations,
                'sessions-query-write-owner',
                repoPath,
                'session query writes must go through cache owners'
            )
        }
        if (
            /(useQuery|useInfiniteQuery|useQueries|useSuspenseQuery|useSuspenseInfiniteQuery)\s*\(/.test(source) &&
            !fileStartsWithPrefix(repoPath, tanstackQueryHookAllowPrefixes) &&
            !tanstackQueryHookAllowFiles.has(repoPath)
        ) {
            addViolation(
                violations,
                'tanstack-query-owner',
                repoPath,
                'TanStack Query reads must live in hooks/queries'
            )
        }
        if (/\buseMutation\s*\(/.test(source) && !fileStartsWithPrefix(repoPath, tanstackMutationHookAllowPrefixes)) {
            addViolation(
                violations,
                'tanstack-mutation-owner',
                repoPath,
                'TanStack Query mutations must live in hooks/mutations'
            )
        }
        if (
            /\b(createRouter|createRootRoute|createRoute|lazyRouteComponent)\s*\(/.test(source) &&
            !routerOwnerFiles.has(repoPath)
        ) {
            addViolation(violations, 'router-owner', repoPath, 'TanStack Router creation must stay inside router owner')
        }
    }
    for (const violation of collectRootWorkspaceRouteViolations(
        readFileSync(join(repoRoot, 'web/src/router.tsx'), 'utf8')
    )) {
        addViolation(violations, 'router-shell-owner', 'web/src/router.tsx', violation)
    }
}

export function runOwnerBoundaryGate(): { violations: Violation[]; markdown: string } {
    const violations: Violation[] = []
    checkCrossPackageImports(violations)
    checkSourceOwnerRules(violations)
    checkWebOwnerRules(violations)

    const lines = ['# Verify Owner Boundary', '', `- Violations: ${violations.length}`]
    lines.push(violations.length === 0 ? '- Status: PASS' : '- Status: FAIL')
    for (const violation of violations) {
        lines.push(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
    }
    return { violations, markdown: lines.join('\n') }
}

function main(): void {
    const result = runOwnerBoundaryGate()
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(artifactDir, 'latest.md'), `${result.markdown}\n`)
    if (result.violations.length > 0) {
        console.error('[verify] owner-boundary failed:')
        for (const violation of result.violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }
    console.log('[verify] owner-boundary passed')
}

if (import.meta.main) {
    main()
}
