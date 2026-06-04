import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditDocs } from '../audit/docs'

type DocViolation = { rule: string; file: string; message: string }

// Hard invariants only: README must not leak internal semantics, and no doc may
// hardcode the current machine's absolute repo path. Broader docs gardening
// (broken refs, index coverage, line budgets) stays in the audit:docs report.
export const DOCS_GUARD_RULES: ReadonlySet<string> = new Set(['structured-doc-leak', 'absolute-repo-path'])

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/verify/docs-guard')

export function filterDocsGuardViolations(violations: readonly DocViolation[]): DocViolation[] {
    return violations.filter((violation) => DOCS_GUARD_RULES.has(violation.rule))
}

export function collectDocsGuardViolations(): DocViolation[] {
    return filterDocsGuardViolations(auditDocs({ touchedPaths: [] }).violations)
}

function main(): void {
    const violations = collectDocsGuardViolations()
    mkdirSync(artifactDir, { recursive: true })
    const lines = [
        '# Verify Docs Guard',
        '',
        `- Gate rules: ${[...DOCS_GUARD_RULES].join(', ')}`,
        `- Violations: ${violations.length}`,
        violations.length === 0 ? '- Status: PASS' : '- Status: FAIL',
        ...violations.map((violation) => `- [${violation.rule}] ${violation.file}: ${violation.message}`),
    ]
    writeFileSync(join(artifactDir, 'latest.md'), lines.join('\n'))
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(violations, null, 2))

    if (violations.length > 0) {
        console.error('[verify] docs guard found README/doc leaks:')
        for (const violation of violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[verify] docs guard passed')
}

if (import.meta.main) {
    main()
}
