export const generatedArtifactPaths = ['pairing/deploy-bundle.tar.gz', 'pairing/deploy-bundle.sha256'] as const
export const generatedArtifactPrefixes = ['pairing/deploy-bundle/'] as const

export function isGeneratedArtifactPath(repoPath: string): boolean {
    return (
        generatedArtifactPaths.includes(repoPath as (typeof generatedArtifactPaths)[number]) ||
        generatedArtifactPrefixes.some((prefix) => repoPath.startsWith(prefix))
    )
}

export function isGeneratedArtifactDirName(name: string): boolean {
    return name === 'deploy-bundle'
}
