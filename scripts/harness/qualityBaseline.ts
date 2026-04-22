import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
    createQualityBaselineSnapshot,
    formatAuditMarkdown,
    qualityArtifactDir,
    qualityBaselinePath,
    runQualityAudit,
    writeQualityArtifacts,
} from './qualityAudit'

function main(): void {
    const results = runQualityAudit()
    const baseline = createQualityBaselineSnapshot(results)
    mkdirSync(dirname(qualityBaselinePath), { recursive: true })
    writeFileSync(qualityBaselinePath, `${JSON.stringify(baseline, null, 2)}\n`)
    writeFileSync(join(dirname(qualityBaselinePath), 'quality-baseline.md'), formatAuditMarkdown(results))
    writeQualityArtifacts(results)
    writeFileSync(`${qualityArtifactDir}/baseline.md`, formatAuditMarkdown(results))
    console.log(`[harness] quality baseline updated: ${qualityBaselinePath}`)
}

if (import.meta.main) {
    main()
}
