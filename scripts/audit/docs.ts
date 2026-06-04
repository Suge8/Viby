import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractMarkdownPathRefs } from '../lib/support'
import { collectTouchedPathsFromGit, describeScopedModules, resolveScopedModules } from '../lib/verifyScope'

type DocViolation = {
    rule: string
    file: string
    message: string
}

type DocAuditResult = {
    checkedFiles: string[]
    violations: DocViolation[]
    markdown: string
}

type StructuredDocPolicy = {
    path: string
    maxLines: number
    requiredRefs: string[]
    requiredPhrases?: string[]
    forbiddenPhrases?: string[]
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const repoRootMarker = repoRoot.replaceAll('\\', '/')
const docsArtifactDir = join(repoRoot, '.artifacts/audit/docs')
const repoRootEntries = new Set(readdirSync(repoRoot))
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const docSourceDirs = ['.']
const docsReadmeIndexRoots = [
    'docs/architecture',
    'docs/development',
    'docs/deployment',
    'docs/operations',
    'docs/internal',
]
const docsReadmeIndexIgnore = new Set(['docs/internal/update.md'])
const optionalLocalOnlyRefs = new Set(['docs/internal/update.md'])
// README 是用户/产品入口；以下内部语义禁止泄露到 README，只能进 AGENTS.md / docs/。
// owner 规则、边界、内部基础设施术语、产品定位内部框架、内部文档/AGENTS 指针、dev/ops 命令。
const readmeForbiddenPhrases = [
    'docs/internal/',
    '.taskmaster/',
    'AGENTS.md',
    '../docs/',
    'bun run',
    '单一 owner',
    'durable owner',
    'authoritative owner',
    'truth source',
    'schema owner',
    '事实源',
    '第二套',
    'daemon',
    '普通用户',
    'Socket.IO',
    'SQLite',
    'Service Worker',
    '## 产品边界',
    '## 工程边界',
] as const
const readmePolicies: readonly StructuredDocPolicy[] = [
    {
        path: 'README.md',
        maxLines: 120,
        requiredRefs: [],
        requiredPhrases: ['## 快速开始'],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'web/README.md',
        maxLines: 120,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'hub/README.md',
        maxLines: 120,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'app-core/README.md',
        maxLines: 140,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'desktop/README.md',
        maxLines: 100,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'pairing/README.md',
        maxLines: 120,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
    {
        path: 'shared/README.md',
        maxLines: 80,
        requiredRefs: [],
        requiredPhrases: [],
        forbiddenPhrases: readmeForbiddenPhrases,
    },
]
const agentsPolicies: readonly StructuredDocPolicy[] = [
    {
        path: 'AGENTS.md',
        maxLines: 140,
        requiredRefs: ['docs/internal/agent-workflow.md', 'docs/README.md'],
        requiredPhrases: ['## 全仓硬规则', '## 文档索引'],
    },
    {
        path: 'web/AGENTS.md',
        maxLines: 120,
        requiredRefs: ['README.md', '../docs/development/web-boundaries.md', '../docs/internal/agent-workflow.md'],
        requiredPhrases: ['## 本目录规则', '## 验证基线'],
    },
    {
        path: 'hub/AGENTS.md',
        maxLines: 120,
        requiredRefs: ['hub/README.md', '../docs/development/hub-owners.md', '../docs/internal/agent-workflow.md'],
        requiredPhrases: ['## Hub 硬规则', '## 验证'],
    },
    {
        path: 'app-core/AGENTS.md',
        maxLines: 120,
        requiredRefs: [
            'app-core/README.md',
            '../docs/development/app-core-runtime-boundaries.md',
            '../docs/internal/agent-workflow.md',
        ],
        requiredPhrases: ['## 硬规则', '## 验证基线'],
    },
    {
        path: 'desktop/AGENTS.md',
        maxLines: 90,
        requiredRefs: ['desktop/README.md', '../docs/internal/agent-workflow.md'],
        requiredPhrases: ['## 硬规则', '## 验证'],
    },
    {
        path: 'pairing/AGENTS.md',
        maxLines: 100,
        requiredRefs: [
            'pairing/README.md',
            '../docs/deployment/pairing-broker.md',
            '../docs/internal/agent-workflow.md',
        ],
        requiredPhrases: ['## Pairing 硬规则', '## 验证基线'],
    },
    {
        path: 'shared/AGENTS.md',
        maxLines: 100,
        requiredRefs: [
            'shared/README.md',
            '../docs/development/shared-contracts.md',
            '../docs/internal/agent-workflow.md',
        ],
        requiredPhrases: ['## Shared 硬规则', '## 验证基线'],
    },
]

function walkMarkdownFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (
                entry.name === 'node_modules' ||
                entry.name === '.git' ||
                entry.name === 'dist' ||
                entry.name === '.artifacts' ||
                entry.name === 'deploy-bundle'
            ) {
                continue
            }
            results.push(...walkMarkdownFiles(fullPath))
            continue
        }
        if (entry.name.endsWith('.md')) {
            results.push(fullPath)
        }
    }
    return results
}

function toRepoPath(path: string): string {
    return relative(repoRoot, path) || '.'
}

function isLocalPathRef(value: string): boolean {
    const normalized = stripRefSuffix(value)
    if (
        !normalized ||
        /\s/.test(normalized) ||
        normalized.startsWith('#') ||
        normalized.startsWith('/') ||
        normalized.startsWith('~/') ||
        normalized.includes('://') ||
        normalized.startsWith('mailto:') ||
        normalized.includes('<') ||
        normalized.includes('>') ||
        normalized.includes('*')
    ) {
        return false
    }

    const firstSegment = normalized.split('/')[0] ?? ''
    const isCurrentDirectoryRef =
        normalized === 'AGENTS.md' ||
        normalized === 'README.md' ||
        normalized.startsWith('./') ||
        normalized.startsWith('../')
    const isRepoRootRef = repoRootEntries.has(firstSegment)

    if (!isCurrentDirectoryRef && !isRepoRootRef) {
        return false
    }

    return (
        normalized.endsWith('.md') ||
        normalized.endsWith('.mdc') ||
        normalized.endsWith('.json') ||
        normalized.endsWith('AGENTS.md') ||
        normalized.endsWith('README.md')
    )
}

function resolveRef(sourceFile: string, ref: string): string {
    const normalizedRef = stripRefSuffix(ref)
    if (normalizedRef.startsWith('/') && existsSync(normalizedRef)) {
        return normalizedRef
    }
    if (normalizedRef.startsWith('/')) {
        return normalize(resolve(repoRoot, normalizedRef.slice(1)))
    }
    if (normalizedRef.startsWith('./') || normalizedRef.startsWith('../')) {
        return normalize(resolve(dirname(join(repoRoot, sourceFile)), normalizedRef))
    }

    const firstSegment = normalizedRef.split('/')[0] ?? ''
    if (repoRootEntries.has(firstSegment)) {
        return normalize(resolve(repoRoot, normalizedRef))
    }

    return normalize(resolve(dirname(join(repoRoot, sourceFile)), normalizedRef))
}

function stripRefSuffix(ref: string): string {
    return ref.replace(/[?#].*$/, '').trim()
}

function readDocSourceFiles(): string[] {
    const files = new Set<string>()
    for (const dir of docSourceDirs) {
        if (!existsSync(join(repoRoot, dir))) {
            continue
        }
        for (const file of walkMarkdownFiles(join(repoRoot, dir))) {
            files.add(toRepoPath(file))
        }
    }
    return [...files]
}

function existsResolvedRef(resolved: string): boolean {
    return existsSync(resolved)
}

function toComparableRepoPath(resolved: string): string {
    return toRepoPath(resolved.startsWith(repoRoot) ? resolved : resolve(repoRoot, resolved))
}

function isLocalOnlyDocPath(file: string): boolean {
    return file === 'AGENTS.md' || file.endsWith('/AGENTS.md') || file.startsWith('docs/')
}

function checkStructuredDocPolicies(violations: DocViolation[], scopedPolicies?: ReadonlySet<string>): void {
    for (const policy of [...readmePolicies, ...agentsPolicies]) {
        if (scopedPolicies && !scopedPolicies.has(policy.path)) {
            continue
        }
        const fullPath = join(repoRoot, policy.path)
        if (!existsSync(fullPath)) {
            if (isCi && isLocalOnlyDocPath(policy.path)) {
                continue
            }
            violations.push({
                rule: 'structured-doc-missing',
                file: policy.path,
                message: 'required structured doc is missing',
            })
            continue
        }

        const content = readFileSync(fullPath, 'utf8')
        const refs = new Set(extractMarkdownPathRefs(content))
        const lines = content.split(/\r?\n/).length

        if (lines > policy.maxLines) {
            violations.push({
                rule: 'structured-doc-length',
                file: policy.path,
                message: `expected <= ${policy.maxLines} lines, found ${lines}`,
            })
        }

        for (const ref of policy.requiredRefs) {
            if (!refs.has(ref) && !content.includes(ref)) {
                violations.push({
                    rule: 'structured-doc-ref',
                    file: policy.path,
                    message: `missing required mapped reference: ${ref}`,
                })
            }
        }

        for (const phrase of policy.requiredPhrases ?? []) {
            if (!content.includes(phrase)) {
                violations.push({
                    rule: 'structured-doc-shape',
                    file: policy.path,
                    message: `missing required phrase: ${phrase}`,
                })
            }
        }

        for (const phrase of policy.forbiddenPhrases ?? []) {
            if (content.includes(phrase)) {
                violations.push({
                    rule: 'structured-doc-leak',
                    file: policy.path,
                    message: `forbidden phrase leaked into doc: ${phrase}`,
                })
            }
        }
    }
}

export function auditDocs(options?: { scopeSpec?: string | null; touchedPaths?: readonly string[] }): DocAuditResult {
    const violations: DocViolation[] = []
    const allFiles = readDocSourceFiles()
    const touchedPaths = [...(options?.touchedPaths ?? collectTouchedPathsFromGit())]
    const touchedSet = new Set(touchedPaths)
    const scopeModules = resolveScopedModules({
        scopeSpec: options?.scopeSpec,
        touchedPaths,
    })
    const scopedFiles = touchedSet.size > 0 ? allFiles.filter((file) => touchedSet.has(file)) : allFiles
    const files = scopedFiles
    const scopedPolicies =
        touchedSet.size > 0
            ? new Set(scopedFiles.filter((file) => file.endsWith('.md') || file.endsWith('.mdc')))
            : undefined

    for (const file of files) {
        const fullPath = join(repoRoot, file)
        if (!existsSync(fullPath)) {
            violations.push({
                rule: 'doc-source-missing',
                file,
                message: 'expected doc source file is missing',
            })
            continue
        }

        const content = readFileSync(fullPath, 'utf8')
        if (content.includes(repoRootMarker)) {
            violations.push({
                rule: 'absolute-repo-path',
                file,
                message: `replace absolute local path with repo-relative path: ${repoRootMarker}`,
            })
        }
        for (const ref of extractMarkdownPathRefs(content)) {
            if (!isLocalPathRef(ref)) {
                continue
            }
            const resolved = resolveRef(file, ref)
            if (!existsResolvedRef(resolved)) {
                const comparablePath = toComparableRepoPath(resolved)
                if (optionalLocalOnlyRefs.has(comparablePath) || (isCi && isLocalOnlyDocPath(comparablePath))) {
                    continue
                }
                violations.push({
                    rule: 'broken-doc-ref',
                    file,
                    message: `referenced path does not exist: ${ref}`,
                })
            }
        }
    }

    const docsReadmePath = join(repoRoot, 'docs/README.md')
    const docsReadmeRefs = new Set(
        existsSync(docsReadmePath)
            ? extractMarkdownPathRefs(readFileSync(docsReadmePath, 'utf8'))
                  .filter((ref) => ref.startsWith('docs/'))
                  .map((ref) => toComparableRepoPath(resolveRef('docs/README.md', ref)))
            : []
    )

    const docsCoverageRoots =
        touchedSet.size > 0
            ? docsReadmeIndexRoots.filter((root) => touchedPaths.some((path) => path.startsWith(`${root}/`)))
            : docsReadmeIndexRoots

    for (const root of docsCoverageRoots) {
        if (!existsSync(join(repoRoot, root))) {
            continue
        }
        for (const file of walkMarkdownFiles(join(repoRoot, root))) {
            const repoPath = toRepoPath(file)
            if (docsReadmeIndexIgnore.has(repoPath)) {
                continue
            }
            if (touchedSet.size > 0 && !touchedSet.has(repoPath)) {
                continue
            }
            if (!docsReadmeRefs.has(repoPath)) {
                violations.push({
                    rule: 'docs-readme-coverage',
                    file: 'docs/README.md',
                    message: `missing docs index entry for ${repoPath}`,
                })
            }
        }
    }

    checkStructuredDocPolicies(violations, scopedPolicies)

    const lines: string[] = []
    lines.push('# Docs Audit')
    lines.push('')
    lines.push(
        `- Scope: ${describeScopedModules(scopeModules, {
            scopeSpec: options?.scopeSpec,
            touchedPaths,
        })}`
    )
    lines.push(`- Checked files: ${files.length}`)
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
        checkedFiles: files,
        violations,
        markdown: lines.join('\n'),
    }
}

function main(): void {
    const result = auditDocs({
        scopeSpec: process.env.VIBY_VERIFY_SCOPE,
    })
    mkdirSync(docsArtifactDir, { recursive: true })
    writeFileSync(join(docsArtifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(docsArtifactDir, 'latest.md'), result.markdown)

    if (result.violations.length > 0) {
        console.warn('[audit] docs found issues:')
        for (const violation of result.violations) {
            console.warn(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        return
    }

    console.log('[audit] docs passed')
}

if (import.meta.main) {
    main()
}
