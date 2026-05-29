import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    isProtocolVersionCompatible,
    PROTOCOL_VERSION,
    WEB_BUILD_METADATA_FILE_NAME,
    WebBuildMetadataSchema,
} from '@viby/protocol'

export type WebappDistResolution = {
    distDir: string
    indexHtmlPath: string
    status: 'ready' | 'missing' | 'incompatible'
}

type WebappDistSearchOptions = {
    cwd?: string
    moduleDir?: string
}

function getCandidateDistDirs(options: Required<WebappDistSearchOptions>): string[] {
    return [
        options.moduleDir,
        join(options.cwd, 'dist'),
        join(options.cwd, '..', 'web', 'dist'),
        join(options.moduleDir, '..', '..', '..', 'web', 'dist'),
        join(options.cwd, 'web', 'dist'),
    ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index)
}

function hasCompatibleBuildMetadata(distDir: string): boolean {
    const metadataPath = join(distDir, WEB_BUILD_METADATA_FILE_NAME)
    if (!existsSync(metadataPath)) return false

    try {
        const metadata = WebBuildMetadataSchema.parse(JSON.parse(readFileSync(metadataPath, 'utf8')))
        return isProtocolVersionCompatible(PROTOCOL_VERSION, {
            currentProtocolVersion: metadata.protocolVersion,
            minSupportedProtocolVersion: metadata.minSupportedProtocolVersion,
        })
    } catch {
        return false
    }
}

export function findWebappDistDir(options: WebappDistSearchOptions = {}): WebappDistResolution {
    const searchOptions = {
        cwd: options.cwd ?? process.cwd(),
        moduleDir: options.moduleDir ?? import.meta.dir,
    }
    const candidates = getCandidateDistDirs(searchOptions)
    const existingCandidates = candidates
        .map((distDir) => ({
            distDir,
            indexHtmlPath: join(distDir, 'index.html'),
        }))
        .filter((candidate) => existsSync(candidate.indexHtmlPath))

    const compatibleCandidate = existingCandidates.find((candidate) => hasCompatibleBuildMetadata(candidate.distDir))
    if (compatibleCandidate) return { ...compatibleCandidate, status: 'ready' }

    if (existingCandidates.length > 0) return { ...existingCandidates[0], status: 'incompatible' }

    const distDir = candidates[0]
    return { distDir, indexHtmlPath: join(distDir, 'index.html'), status: 'missing' }
}
