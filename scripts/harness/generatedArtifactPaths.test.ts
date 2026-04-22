import { describe, expect, it } from 'bun:test'
import { isGeneratedArtifactDirName, isGeneratedArtifactPath } from './generatedArtifactPaths'

describe('generated artifact paths', () => {
    it('treats pairing deploy bundle outputs as generated artifacts', () => {
        expect(isGeneratedArtifactPath('pairing/deploy-bundle/index.js')).toBe(true)
        expect(isGeneratedArtifactPath('pairing/deploy-bundle/DEPLOY.md')).toBe(true)
        expect(isGeneratedArtifactPath('pairing/deploy-bundle.tar.gz')).toBe(true)
        expect(isGeneratedArtifactPath('pairing/deploy-bundle.sha256')).toBe(true)
        expect(isGeneratedArtifactPath('pairing/src/index.ts')).toBe(false)
    })

    it('recognizes generated artifact directory names', () => {
        expect(isGeneratedArtifactDirName('deploy-bundle')).toBe(true)
        expect(isGeneratedArtifactDirName('dist')).toBe(false)
    })
})
