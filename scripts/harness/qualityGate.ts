import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModuleAuditResult, QualityBaselineModule, QualityBaselineSnapshot } from './qualityAudit'
import { qualityArtifactDir, qualityBaselinePath, runQualityAudit, writeQualityArtifacts } from './qualityAudit'
import {
    type AuditedModule,
    collectTouchedPathsFromGit,
    describeScopedModules,
    resolveScopedModules,
} from './qualityScope'

type GateOptions = {
    scopeModules?: readonly AuditedModule[]
    scopeDescription?: string
}

type GateViolation = {
    module: string
    rule: string
    message: string
}

type GateResult = {
    violations: GateViolation[]
    markdown: string
}

const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'

function readBaseline(): QualityBaselineSnapshot {
    if (!existsSync(qualityBaselinePath)) {
        throw new Error(`quality baseline missing: ${qualityBaselinePath}`)
    }

    const parsed = JSON.parse(readFileSync(qualityBaselinePath, 'utf8')) as QualityBaselineSnapshot & {
        modules?: Array<
            QualityBaselineModule & {
                metrics: QualityBaselineModule['metrics'] & {
                    onSessionFoundRefs?: number
                }
            }
        >
    }

    return {
        ...parsed,
        modules: (parsed.modules ?? []).map((module) => ({
            ...module,
            metrics: {
                ...module.metrics,
                sessionFoundRefs: module.metrics.sessionFoundRefs ?? module.metrics.onSessionFoundRefs ?? 0,
            },
        })),
    }
}

function getBaselineModule(baseline: QualityBaselineSnapshot, moduleName: string): QualityBaselineModule | undefined {
    return baseline.modules.find((entry) => entry.module === moduleName)
}

export function compareAgainstBaseline(
    baseline: QualityBaselineSnapshot,
    results: readonly ModuleAuditResult[],
    options: GateOptions = {}
): GateResult {
    const violations: GateViolation[] = []
    const hasScopedModules = Object.prototype.hasOwnProperty.call(options, 'scopeModules')
    const scopedResults = hasScopedModules
        ? results.filter((result) => options.scopeModules?.includes(result.metrics.module))
        : results

    for (const result of scopedResults) {
        const currentModule = result.metrics.module
        const previous = getBaselineModule(baseline, currentModule)
        if (!previous) {
            violations.push({
                module: currentModule,
                rule: 'missing-baseline-module',
                message: 'module is missing from baseline snapshot',
            })
            continue
        }

        if (result.score.codeHealth < previous.codeHealth) {
            violations.push({
                module: currentModule,
                rule: 'code-health-regressed',
                message: `code health dropped from ${previous.codeHealth} to ${result.score.codeHealth}`,
            })
        }

        if (result.score.collaborationReadiness < previous.collaborationReadiness) {
            violations.push({
                module: currentModule,
                rule: 'collaboration-regressed',
                message: `collaboration readiness dropped from ${previous.collaborationReadiness} to ${result.score.collaborationReadiness}`,
            })
        }

        if (result.metrics.oversizedSourceFiles > previous.metrics.oversizedSourceFiles) {
            violations.push({
                module: currentModule,
                rule: 'oversized-source-files',
                message: `oversized source files increased from ${previous.metrics.oversizedSourceFiles} to ${result.metrics.oversizedSourceFiles}`,
            })
        }

        if (result.metrics.oversizedSourceExcessLines > previous.metrics.oversizedSourceExcessLines) {
            violations.push({
                module: currentModule,
                rule: 'oversized-source-excess',
                message: `oversized source excess lines increased from ${previous.metrics.oversizedSourceExcessLines} to ${result.metrics.oversizedSourceExcessLines}`,
            })
        }

        if (result.metrics.oversizedTestFiles > previous.metrics.oversizedTestFiles) {
            violations.push({
                module: currentModule,
                rule: 'oversized-test-files',
                message: `oversized test files increased from ${previous.metrics.oversizedTestFiles} to ${result.metrics.oversizedTestFiles}`,
            })
        }

        if (result.metrics.storageFiles > previous.metrics.storageFiles) {
            violations.push({
                module: currentModule,
                rule: 'storage-fragmentation',
                message: `storage owner files increased from ${previous.metrics.storageFiles} to ${result.metrics.storageFiles}`,
            })
        }

        if (result.metrics.queryOwnerExceptionFiles > previous.metrics.queryOwnerExceptionFiles) {
            violations.push({
                module: currentModule,
                rule: 'query-owner-exception',
                message: `query owner exception files increased from ${previous.metrics.queryOwnerExceptionFiles} to ${result.metrics.queryOwnerExceptionFiles}`,
            })
        }

        if (result.metrics.mutationOwnerExceptionFiles > previous.metrics.mutationOwnerExceptionFiles) {
            violations.push({
                module: currentModule,
                rule: 'mutation-owner-exception',
                message: `mutation owner exception files increased from ${previous.metrics.mutationOwnerExceptionFiles} to ${result.metrics.mutationOwnerExceptionFiles}`,
            })
        }

        if (result.metrics.legacyCompatFiles > previous.metrics.legacyCompatFiles) {
            violations.push({
                module: currentModule,
                rule: 'legacy-compat',
                message: `legacy compatibility files increased from ${previous.metrics.legacyCompatFiles} to ${result.metrics.legacyCompatFiles}`,
            })
        }

        if (result.metrics.sessionFoundRefs > previous.metrics.sessionFoundRefs) {
            violations.push({
                module: currentModule,
                rule: 'session-found-sprawl',
                message: `onSessionFound refs increased from ${previous.metrics.sessionFoundRefs} to ${result.metrics.sessionFoundRefs}`,
            })
        }

        if (result.score.derived.testToSourceRatio + 0.0001 < previous.metrics.testToSourceRatio) {
            violations.push({
                module: currentModule,
                rule: 'test-ratio-regressed',
                message: `test/source ratio dropped from ${(previous.metrics.testToSourceRatio * 100).toFixed(1)}% to ${(result.score.derived.testToSourceRatio * 100).toFixed(1)}%`,
            })
        }

        if (result.score.derived.memoDensityPerKloc > previous.metrics.memoDensityPerKloc + 0.05) {
            violations.push({
                module: currentModule,
                rule: 'memo-density-regressed',
                message: `memo density rose from ${previous.metrics.memoDensityPerKloc.toFixed(2)} to ${result.score.derived.memoDensityPerKloc.toFixed(2)} per KLOC`,
            })
        }
    }

    const lines: string[] = []
    lines.push('# Harness Quality Delta')
    lines.push('')
    lines.push(`- Baseline: ${qualityBaselinePath}`)
    lines.push(`- Scope: ${options.scopeDescription ?? 'full scope: all audited modules'}`)
    lines.push(`- Violations: ${violations.length}`)
    if (scopedResults.length === 0) {
        lines.push('- Audited modules in scope: none')
        lines.push('- Status: PASS')
    } else if (violations.length === 0) {
        lines.push('- Status: PASS')
    } else {
        lines.push('- Status: FAIL')
        lines.push('')
        for (const violation of violations) {
            lines.push(`- [${violation.module}] ${violation.rule}: ${violation.message}`)
        }
    }

    return {
        violations,
        markdown: lines.join('\n'),
    }
}

function main(): void {
    const results = runQualityAudit()
    const touchedPaths = collectTouchedPathsFromGit()
    const scopeModules = resolveScopedModules({
        scopeSpec: process.env.VIBY_HARNESS_SCOPE,
        touchedPaths,
    })
    if (isCi && !existsSync(qualityBaselinePath)) {
        writeQualityArtifacts(results)
        mkdirSync(qualityArtifactDir, { recursive: true })
        const markdown = [
            '# Harness Quality Delta',
            '',
            `- Baseline: ${qualityBaselinePath}`,
            '- Scope: CI checkout without local-only baseline',
            '- Violations: 0',
            '- Status: PASS',
        ].join('\n')
        writeFileSync(join(qualityArtifactDir, 'delta.md'), markdown)
        writeFileSync(join(qualityArtifactDir, 'delta.json'), JSON.stringify({ violations: [], markdown }, null, 2))
        console.log('[harness] quality gate passed')
        return
    }

    const baseline = readBaseline()
    const gate = compareAgainstBaseline(baseline, results, {
        scopeModules,
        scopeDescription: describeScopedModules(scopeModules, {
            scopeSpec: process.env.VIBY_HARNESS_SCOPE,
            touchedPaths,
        }),
    })
    writeQualityArtifacts(results)
    mkdirSync(qualityArtifactDir, { recursive: true })
    writeFileSync(join(qualityArtifactDir, 'delta.md'), gate.markdown)
    writeFileSync(join(qualityArtifactDir, 'delta.json'), JSON.stringify(gate, null, 2))

    if (gate.violations.length > 0) {
        console.error('[harness] quality gate failed:')
        for (const violation of gate.violations) {
            console.error(`- [${violation.module}] ${violation.rule}: ${violation.message}`)
        }
        console.error(
            '[harness] if the regression is intentional and accepted, refresh the local baseline with `bun run harness:quality:baseline` after updating docs/internal/quality-score.md and docs/internal/tech-debt-tracker.md'
        )
        process.exit(1)
    }

    console.log('[harness] quality gate passed')
}

if (import.meta.main) {
    main()
}
