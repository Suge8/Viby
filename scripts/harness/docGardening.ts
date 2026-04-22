import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectTouchedPathsFromGit, describeScopedModules, resolveScopedModules } from './qualityScope'
import { extractMarkdownPathRefs } from './support'

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
const docsArtifactDir = join(repoRoot, '.artifacts/harness/docs')
const repoRootEntries = new Set(readdirSync(repoRoot))
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const docSourceDirs = ['docs']
const docSourceFiles = [
    'AGENTS.md',
    'README.md',
    'cli/AGENTS.md',
    'cli/README.md',
    'desktop/README.md',
    'hub/README.md',
    'pairing/AGENTS.md',
    'pairing/README.md',
    'shared/AGENTS.md',
    'shared/README.md',
    'web/AGENTS.md',
    'web/README.md',
    'hub/AGENTS.md',
    'desktop/AGENTS.md',
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
]
const docsReadmeIndexRoots = [
    'docs/architecture',
    'docs/development',
    'docs/deployment',
    'docs/operations',
    'docs/internal',
]
const docsReadmeIndexIgnore = new Set([
    'docs/internal/update.md',
    'docs/internal/quality-baseline.json',
    'docs/internal/quality-baseline.md',
])
const optionalLocalOnlyRefs = new Set(['docs/internal/update.md'])
const readmePolicies: readonly StructuredDocPolicy[] = [
    {
        path: 'README.md',
        maxLines: 120,
        requiredRefs: [
            'docs/README.md',
            'web/README.md',
            'hub/README.md',
            'cli/README.md',
            'desktop/README.md',
            'pairing/README.md',
        ],
        requiredPhrases: ['## 快速开始', '## 文档分层'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'web/README.md',
        maxLines: 120,
        requiredRefs: ['README.md', '../docs/development/web-boundaries.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'hub/README.md',
        maxLines: 120,
        requiredRefs: ['README.md', '../docs/development/hub-owners.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'cli/README.md',
        maxLines: 140,
        requiredRefs: ['README.md', '../docs/development/cli-runtime-boundaries.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'desktop/README.md',
        maxLines: 100,
        requiredRefs: ['README.md', 'AGENTS.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'pairing/README.md',
        maxLines: 120,
        requiredRefs: ['README.md', '../docs/development/pairing-deployment.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: [
            'docs/internal/',
            '.taskmaster/',
            '单一 owner',
            'durable owner',
            'authoritative owner',
            'truth source',
            'schema owner',
        ],
    },
    {
        path: 'shared/README.md',
        maxLines: 80,
        requiredRefs: ['README.md', '../docs/development/shared-contracts.md'],
        requiredPhrases: ['## 继续阅读'],
        forbiddenPhrases: ['docs/internal/', '.taskmaster/'],
    },
]
const agentsPolicies: readonly StructuredDocPolicy[] = [
    {
        path: 'AGENTS.md',
        maxLines: 140,
        requiredRefs: ['docs/internal/harness-activity-path.md', 'docs/README.md'],
        requiredPhrases: ['## 全仓硬规则', '## 文档索引'],
    },
    {
        path: 'web/AGENTS.md',
        maxLines: 120,
        requiredRefs: [
            'README.md',
            '../docs/development/web-boundaries.md',
            '../docs/internal/harness-activity-path.md',
        ],
        requiredPhrases: ['## 本目录规则', '## 验证基线'],
    },
    {
        path: 'hub/AGENTS.md',
        maxLines: 120,
        requiredRefs: [
            'hub/README.md',
            '../docs/development/hub-owners.md',
            '../docs/internal/harness-activity-path.md',
        ],
        requiredPhrases: ['## Hub 硬规则', '## 验证'],
    },
    {
        path: 'cli/AGENTS.md',
        maxLines: 120,
        requiredRefs: [
            'cli/README.md',
            '../docs/development/cli-runtime-boundaries.md',
            '../docs/internal/harness-activity-path.md',
        ],
        requiredPhrases: ['## CLI 硬规则', '## 验证基线'],
    },
    {
        path: 'desktop/AGENTS.md',
        maxLines: 90,
        requiredRefs: ['desktop/README.md', '../docs/internal/harness-activity-path.md'],
        requiredPhrases: ['## 硬规则', '## 验证'],
    },
    {
        path: 'pairing/AGENTS.md',
        maxLines: 100,
        requiredRefs: [
            'pairing/README.md',
            '../docs/development/pairing-deployment.md',
            '../docs/internal/harness-activity-path.md',
        ],
        requiredPhrases: ['## Pairing 硬规则', '## 验证基线'],
    },
    {
        path: 'shared/AGENTS.md',
        maxLines: 100,
        requiredRefs: [
            'shared/README.md',
            '../docs/development/shared-contracts.md',
            '../docs/internal/harness-activity-path.md',
        ],
        requiredPhrases: ['## Shared 硬规则', '## 验证基线'],
    },
]

function walkMarkdownFiles(dir: string): string[] {
    const results: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
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
        normalized.startsWith('#') ||
        normalized.includes('://') ||
        normalized.startsWith('mailto:') ||
        normalized.includes('<') ||
        normalized.includes('>') ||
        normalized.includes('*')
    ) {
        return false
    }
    const firstSegment = normalized.split('/')[0] ?? ''
    if (
        normalized.startsWith('.') &&
        !normalized.startsWith('./') &&
        !normalized.startsWith('../') &&
        !repoRootEntries.has(firstSegment)
    ) {
        return false
    }
    if (
        !normalized.includes('/') &&
        normalized !== 'AGENTS.md' &&
        normalized !== 'README.md' &&
        normalized !== 'CLAUDE.md'
    ) {
        return false
    }
    return (
        normalized.endsWith('.md') ||
        normalized.endsWith('.mdc') ||
        normalized.endsWith('.json') ||
        normalized.endsWith('/') ||
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
    const files = new Set(docSourceFiles.filter((file) => !isCi || existsSync(join(repoRoot, file))))
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
    return (
        file === 'AGENTS.md' ||
        file.endsWith('/AGENTS.md') ||
        file === 'CLAUDE.md' ||
        file.startsWith('docs/') ||
        file.startsWith('.cursor/') ||
        file.startsWith('.github/instructions/') ||
        file === '.github/copilot-instructions.md'
    )
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
    lines.push('# Harness Docs Audit')
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
        scopeSpec: process.env.VIBY_HARNESS_SCOPE,
    })
    mkdirSync(docsArtifactDir, { recursive: true })
    writeFileSync(join(docsArtifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(docsArtifactDir, 'latest.md'), result.markdown)

    if (result.violations.length > 0) {
        console.error('[harness] docs gate failed:')
        for (const violation of result.violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[harness] docs gate passed')
}

if (import.meta.main) {
    main()
}
