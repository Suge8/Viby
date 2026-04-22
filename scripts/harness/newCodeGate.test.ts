import { describe, expect, it } from 'bun:test'
import type { GovernanceSourceMetrics } from './governancePolicy'
import { evaluateTouchedBudgetEntries } from './newCodeGate'

function metrics(overrides?: Partial<GovernanceSourceMetrics>): GovernanceSourceMetrics {
    return {
        typedAnyRefs: 0,
        rawButtonRefs: 0,
        rawInputRefs: 0,
        rawTextareaRefs: 0,
        rawSelectRefs: 0,
        designMagicRefs: 0,
        consoleRefs: 0,
        fireAndForgetRefs: 0,
        controllerOwnerViolationRefs: 0,
        unownedControlSurfaceRefs: 0,
        ...overrides,
    }
}

describe('new code gate', () => {
    it('passes when an oversized allowlisted test file shrinks', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'hub/src/sync/sessionModel.test.ts',
                baselineLines: 1300,
                currentLines: 1240,
                isTestFile: true,
                baselineGovernanceMetrics: metrics(),
                currentGovernanceMetrics: metrics(),
            },
        ])

        expect(gate.violations).toHaveLength(0)
    })

    it('ignores non-allowlisted files because structural lint owns that failure mode', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'web/src/components/NonBudgeted.tsx',
                baselineLines: 400,
                currentLines: 430,
                isTestFile: false,
                baselineGovernanceMetrics: metrics(),
                currentGovernanceMetrics: metrics(),
            },
        ])

        expect(gate.violations).toHaveLength(0)
    })

    it('fails when an oversized allowlisted test file grows', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'hub/src/sync/sessionModel.test.ts',
                baselineLines: 1300,
                currentLines: 1320,
                isTestFile: true,
                baselineGovernanceMetrics: metrics(),
                currentGovernanceMetrics: metrics(),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'hub/src/sync/sessionModel.test.ts',
                rule: 'oversized-test-grew',
            }),
        ])
    })

    it('fails when typed any grows in a touched source file', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'cli/src/api/rpc/types.ts',
                baselineLines: 80,
                currentLines: 80,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ typedAnyRefs: 1 }),
                currentGovernanceMetrics: metrics({ typedAnyRefs: 2 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'cli/src/api/rpc/types.ts',
                rule: 'typed-any-grew',
            }),
        ])
    })

    it('fails when a non-owner file adds a raw textarea', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'web/src/components/RandomComposer.tsx',
                baselineLines: 40,
                currentLines: 44,
                isTestFile: false,
                baselineGovernanceMetrics: metrics(),
                currentGovernanceMetrics: metrics({ rawTextareaRefs: 1 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'web/src/components/RandomComposer.tsx',
                rule: 'raw-textarea-sprawl',
            }),
        ])
    })

    it('fails when a touched web file adds literal arbitrary design values', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'web/src/components/FancyPanel.tsx',
                baselineLines: 60,
                currentLines: 62,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ designMagicRefs: 1 }),
                currentGovernanceMetrics: metrics({ designMagicRefs: 2 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'web/src/components/FancyPanel.tsx',
                rule: 'design-magic-sprawl',
            }),
        ])
    })

    it('fails when a touched runtime file adds console logging', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'hub/src/notifications/notificationHub.ts',
                baselineLines: 180,
                currentLines: 184,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ consoleRefs: 1 }),
                currentGovernanceMetrics: metrics({ consoleRefs: 2 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'hub/src/notifications/notificationHub.ts',
                rule: 'console-sprawl',
            }),
        ])
    })

    it('fails when a touched backend file adds fire-and-forget calls', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'cli/src/runtime/sessionRuntime.ts',
                baselineLines: 120,
                currentLines: 128,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ fireAndForgetRefs: 0 }),
                currentGovernanceMetrics: metrics({ fireAndForgetRefs: 1 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'cli/src/runtime/sessionRuntime.ts',
                rule: 'fire-and-forget-sprawl',
            }),
        ])
    })

    it('fails when a touched file adds a second controller chain', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'web/src/components/RandomPanel.tsx',
                baselineLines: 60,
                currentLines: 64,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ controllerOwnerViolationRefs: 0 }),
                currentGovernanceMetrics: metrics({ controllerOwnerViolationRefs: 1 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'web/src/components/RandomPanel.tsx',
                rule: 'controller-owner-sprawl',
            }),
        ])
    })

    it('fails when a touched file creates a new unowned control hotspot candidate', () => {
        const gate = evaluateTouchedBudgetEntries([
            {
                file: 'cli/src/codex/codexRemoteSupport.ts',
                baselineLines: 140,
                currentLines: 152,
                isTestFile: false,
                baselineGovernanceMetrics: metrics({ unownedControlSurfaceRefs: 0 }),
                currentGovernanceMetrics: metrics({ unownedControlSurfaceRefs: 1 }),
            },
        ])

        expect(gate.violations).toEqual([
            expect.objectContaining({
                file: 'cli/src/codex/codexRemoteSupport.ts',
                rule: 'control-surface-sprawl',
            }),
        ])
    })
})
