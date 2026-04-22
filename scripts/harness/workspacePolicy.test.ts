import { describe, expect, it } from 'bun:test'
import { evaluateWorkspacePolicy } from './workspacePolicy'

function buildSnapshot(overrides?: Partial<Parameters<typeof evaluateWorkspacePolicy>[0]>) {
    return {
        manifests: {
            'package.json': {
                packageManager: 'bun@1.3.11',
                engines: { bun: '>=1.3.11 <2' },
                scripts: {
                    typecheck:
                        'bun run typecheck:cli && bun run typecheck:web && bun run typecheck:hub && bun run typecheck:desktop && bun run typecheck:pairing && bun run typecheck:shared',
                    test: 'bun run harness:check && bun run test:scripts && bun run test:cli && bun run test:hub && bun run test:web && bun run test:pairing && bun run test:shared',
                },
            },
            'cli/package.json': {
                packageManager: 'bun@1.3.11',
                devDependencies: { typescript: '^5.9.3', 'bun-types': '^1.3.11', vitest: '^4.0.16' },
                dependencies: { react: '^19.2.3', zod: '^4.2.1' },
            },
            'hub/package.json': {
                devDependencies: { typescript: '^5.9.3', 'bun-types': '^1.3.11' },
                dependencies: { zod: '^4.2.1' },
            },
            'web/package.json': {
                devDependencies: { typescript: '^5.9.3', vite: '^7.3.0', vitest: '^4.0.16' },
                dependencies: { react: '^19.2.3', 'react-dom': '^19.2.3' },
            },
            'desktop/package.json': {
                devDependencies: { typescript: '^5.9.3', vite: '^7.3.0' },
                dependencies: { react: '^19.2.3', 'react-dom': '^19.2.3' },
            },
            'pairing/package.json': {
                devDependencies: { typescript: '^5.9.3', 'bun-types': '^1.3.11' },
                dependencies: { zod: '^4.2.1' },
            },
            'shared/package.json': {
                scripts: { typecheck: 'tsc --noEmit', test: 'bun test' },
                devDependencies: { typescript: '^5.9.3', 'bun-types': '^1.3.11' },
                dependencies: { zod: '^4.2.1' },
            },
        },
        workflowText: 'bun-version: 1.3.11',
        dependabotExists: true,
        ...overrides,
    }
}

describe('workspace policy', () => {
    it('passes when workspace governance is aligned', () => {
        const result = evaluateWorkspacePolicy(buildSnapshot())
        expect(result.violations).toHaveLength(0)
    })

    it('fails when root package manager or CI bun version drifts', () => {
        const result = evaluateWorkspacePolicy(
            buildSnapshot({
                manifests: {
                    ...buildSnapshot().manifests,
                    'package.json': {
                        ...buildSnapshot().manifests['package.json'],
                        packageManager: 'bun@1.3.5',
                    },
                },
                workflowText: 'bun-version: 1.3.5',
            })
        )

        expect(result.violations.some((violation) => violation.rule === 'package-manager')).toBe(true)
        expect(result.violations.some((violation) => violation.rule === 'ci-bun-version')).toBe(true)
    })

    it('fails when shared validation entry points or dependabot are missing', () => {
        const result = evaluateWorkspacePolicy(
            buildSnapshot({
                manifests: {
                    ...buildSnapshot().manifests,
                    'shared/package.json': {},
                },
                dependabotExists: false,
            })
        )

        expect(result.violations.some((violation) => violation.rule === 'shared-typecheck')).toBe(true)
        expect(result.violations.some((violation) => violation.rule === 'dependabot')).toBe(true)
    })

    it('fails when dependency versions drift', () => {
        const result = evaluateWorkspacePolicy(
            buildSnapshot({
                manifests: {
                    ...buildSnapshot().manifests,
                    'hub/package.json': {
                        ...buildSnapshot().manifests['hub/package.json'],
                        devDependencies: { typescript: '^5', 'bun-types': '^1.3.11' },
                    },
                },
            })
        )

        expect(result.violations.some((violation) => violation.rule === 'dependency-version-drift')).toBe(true)
    })
})
