import { describe, expect, it } from 'bun:test'
import {
    computeModuleAuditScore,
    formatTrendMarkdown,
    type ModuleAuditMetrics,
    type QualityTrendSnapshot,
} from './qualityAudit'

function buildMetrics(overrides: Partial<ModuleAuditMetrics> = {}): ModuleAuditMetrics {
    return {
        module: 'web',
        sourceFiles: 10,
        testFiles: 5,
        styleFiles: 1,
        sourceLines: 2_000,
        testLines: 1_000,
        styleLines: 120,
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
        hasReadme: true,
        hasAgents: true,
        topSourceFiles: [],
        topStyleFiles: [],
        ...overrides,
    }
}

describe('quality audit scoring', () => {
    it('keeps clean modules near the top of the range', () => {
        const score = computeModuleAuditScore(buildMetrics())
        expect(score.codeHealth).toBe(100)
        expect(score.collaborationReadiness).toBe(100)
    })

    it('separates code health from collaboration readiness', () => {
        const score = computeModuleAuditScore(
            buildMetrics({
                oversizedSourceFiles: 4,
                oversizedSourceExcessLines: 2_400,
                queryOwnerExceptionFiles: 1,
                storageFiles: 10,
                legacyCompatFiles: 2,
                hasAgents: false,
            })
        )

        expect(score.codeHealth).toBeLessThan(100)
        expect(score.collaborationReadiness).toBeLessThan(100)
        expect(score.penalties.complexity).toBeGreaterThan(0)
        expect(score.penalties.reliability).toBeGreaterThan(0)
        expect(score.penalties.maintainability).toBeGreaterThan(0)
        expect(score.penalties.recoverability).toBeGreaterThan(0)
    })

    it('penalizes modules with thin test coverage', () => {
        const score = computeModuleAuditScore(
            buildMetrics({
                sourceLines: 5_000,
                testLines: 400,
            })
        )

        expect(score.penalties.verification).toBe(6)
        expect(score.codeHealth).toBe(94)
    })

    it('does not let missing docs lower the code health score', () => {
        const score = computeModuleAuditScore(
            buildMetrics({
                hasReadme: false,
                hasAgents: false,
            })
        )

        expect(score.codeHealth).toBe(100)
        expect(score.collaborationReadiness).toBe(92)
    })

    it('renders a trend summary for recent history snapshots', () => {
        const history: QualityTrendSnapshot[] = [
            {
                generatedAt: '2026-04-05T00:00:00.000Z',
                modules: [{ module: 'web', codeHealth: 70, collaborationReadiness: 96 }],
            },
            {
                generatedAt: '2026-04-05T01:00:00.000Z',
                modules: [{ module: 'web', codeHealth: 73, collaborationReadiness: 100 }],
            },
        ]

        const markdown = formatTrendMarkdown(history)
        expect(markdown).toContain('Harness Quality Trend')
        expect(markdown).toContain('| `web` | 73 | +3 | 100 | +4 |')
    })
})
