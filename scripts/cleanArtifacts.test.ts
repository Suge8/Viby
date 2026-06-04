import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildArtifactCleanupPlan } from './cleanArtifacts'

function createRepo(): string {
    return mkdtempSync(join(tmpdir(), 'viby-artifacts-'))
}

function writeArtifact(root: string, repoPath: string, mtimeMs = 1): void {
    const path = join(root, repoPath)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, repoPath)
    const mtime = new Date(mtimeMs)
    utimesSync(path, mtime, mtime)
    utimesSync(join(path, '..'), mtime, mtime)
}

describe('cleanArtifacts', () => {
    it('keeps latest heavy artifacts and ignores verify latest outputs', () => {
        const root = createRepo()
        try {
            writeArtifact(root, '.artifacts/verify/style/latest.json')
            writeArtifact(root, '.artifacts/harness/run-1/summary.json', 1)
            writeArtifact(root, '.artifacts/harness/run-2/summary.json', 2)
            writeArtifact(root, '.artifacts/harness/run-3/summary.json', 3)
            writeArtifact(root, 'web/.artifacts/harness/run-1/summary.md', 1)
            writeArtifact(root, 'web/.artifacts/harness/run-2/summary.md', 2)
            writeArtifact(root, 'web/.artifacts/smoke/run-1/summary.md', 1)
            writeArtifact(root, 'web/.artifacts/smoke/run-2/summary.md', 2)

            const plan = buildArtifactCleanupPlan(root, { mode: 'old', keepCount: 1, dryRun: false })
            expect(plan.map((entry) => entry.path).sort()).toEqual([
                '.artifacts/harness/run-1',
                '.artifacts/harness/run-2',
                'web/.artifacts/harness/run-1',
                'web/.artifacts/smoke/run-1',
            ])
        } finally {
            rmSync(root, { force: true, recursive: true })
        }
    })

    it('cleans only known artifact roots in full mode', () => {
        const root = createRepo()
        try {
            writeArtifact(root, '.artifacts/verify/style/latest.json')
            writeArtifact(root, 'web/.artifacts/smoke/run/summary.md')
            writeArtifact(root, 'tmp/.artifacts/keep/file.txt')

            const plan = buildArtifactCleanupPlan(root, { mode: 'all', keepCount: 3, dryRun: false })
            expect(plan.map((entry) => entry.path).sort()).toEqual(['.artifacts', 'web/.artifacts'])
        } finally {
            rmSync(root, { force: true, recursive: true })
        }
    })
})
