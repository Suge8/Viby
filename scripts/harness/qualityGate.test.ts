import { describe, expect, it } from 'bun:test'
import type { ModuleAuditResult, QualityBaselineSnapshot } from './qualityAudit'
import { compareAgainstBaseline } from './qualityGate'

function buildResult(overrides: Partial<ModuleAuditResult> = {}): ModuleAuditResult {
    return {
        metrics: {
            module: 'web',
            sourceFiles: 10,
            testFiles: 5,
            sourceLines: 2_000,
            testLines: 1_000,
            oversizedSourceFiles: 0,
            oversizedSourceExcessLines: 0,
            oversizedTestFiles: 0,
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
            hasReadme: true,
            hasAgents: true,
            topSourceFiles: [],
        },
        score: {
            codeHealth: 100,
            collaborationReadiness: 100,
            bands: {
                codeHealth: 'Excellent',
                collaborationReadiness: 'Excellent',
            },
            penalties: {
                complexity: 0,
                reliability: 0,
                maintainability: 0,
                verification: 0,
                recoverability: 0,
            },
            derived: {
                testToSourceRatio: 0.5,
                memoDensityPerKloc: 1,
            },
        },
        ...overrides,
    }
}

function buildBaseline(): QualityBaselineSnapshot {
    return {
        version: 1,
        generatedAt: '2026-04-05T00:00:00.000Z',
        modules: [
            {
                module: 'web',
                codeHealth: 100,
                collaborationReadiness: 100,
                penalties: {
                    complexity: 0,
                    reliability: 0,
                    maintainability: 0,
                    verification: 0,
                    recoverability: 0,
                },
                metrics: {
                    oversizedSourceFiles: 0,
                    oversizedSourceExcessLines: 0,
                    oversizedTestFiles: 0,
                    storageFiles: 0,
                    queryOwnerExceptionFiles: 0,
                    mutationOwnerExceptionFiles: 0,
                    legacyCompatFiles: 0,
                    sessionFoundRefs: 0,
                    testToSourceRatio: 0.5,
                    memoDensityPerKloc: 1,
                },
            },
        ],
    }
}

describe('quality gate', () => {
    it('passes when current results do not regress', () => {
        const gate = compareAgainstBaseline(buildBaseline(), [buildResult()])
        expect(gate.violations).toHaveLength(0)
    })

    it('fails when code health regresses', () => {
        const gate = compareAgainstBaseline(buildBaseline(), [
            buildResult({
                score: {
                    ...buildResult().score,
                    codeHealth: 95,
                },
            }),
        ])
        expect(gate.violations.some((violation) => violation.rule === 'code-health-regressed')).toBe(true)
    })

    it('fails when a guarded metric grows even if the score stays similar', () => {
        const gate = compareAgainstBaseline(buildBaseline(), [
            buildResult({
                metrics: {
                    ...buildResult().metrics,
                    storageFiles: 1,
                },
            }),
        ])
        expect(gate.violations.some((violation) => violation.rule === 'storage-fragmentation')).toBe(true)
    })

    it('limits the gate to explicit scoped modules', () => {
        const gate = compareAgainstBaseline(
            buildBaseline(),
            [
                buildResult(),
                buildResult({
                    metrics: {
                        ...buildResult().metrics,
                        module: 'hub',
                    },
                    score: {
                        ...buildResult().score,
                        codeHealth: 80,
                    },
                }),
            ],
            {
                scopeModules: ['web'],
                scopeDescription: 'explicit scope: web',
            }
        )

        expect(gate.violations).toHaveLength(0)
        expect(gate.markdown).toContain('explicit scope: web')
    })

    it('passes when explicit scope contains no audited modules', () => {
        const gate = compareAgainstBaseline(buildBaseline(), [buildResult()], {
            scopeModules: [],
            scopeDescription: 'explicit scope: pairing (no audited modules)',
        })

        expect(gate.violations).toHaveLength(0)
        expect(gate.markdown).toContain('Audited modules in scope: none')
    })
})
