import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const tauriDir = resolve(import.meta.dirname, '../src-tauri')
const targetDir = join(tauriDir, 'target')

function normalizePath(value) {
    return value.replaceAll('\\', '/')
}

function readTextIfPresent(filePath) {
    if (!existsSync(filePath)) {
        return null
    }

    try {
        return readFileSync(filePath, 'utf8')
    } catch {
        return null
    }
}

function findStaleBuildArtifact() {
    if (!existsSync(targetDir)) {
        return null
    }

    const expectedTargetPrefix = `${normalizePath(targetDir)}/`
    const candidateRoots = [
        join(targetDir, 'debug', 'build'),
        join(targetDir, 'release', 'build')
    ]

    for (const buildRoot of candidateRoots) {
        if (!existsSync(buildRoot)) {
            continue
        }

        for (const entry of readdirSync(buildRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue
            }

            const entryDir = join(buildRoot, entry.name)
            const candidates = [
                join(entryDir, 'root-output'),
                join(entryDir, 'output'),
                join(entryDir, 'out', 'tauri-core-app-permission-files')
            ]

            for (const candidate of candidates) {
                const content = readTextIfPresent(candidate)
                if (!content) {
                    continue
                }

                const normalizedContent = normalizePath(content)
                const absolutePathMatches = normalizedContent.match(/\/[^\s'",\]]+\/target\/[^\s'",\]]*/g) ?? []
                for (const match of absolutePathMatches) {
                    if (!match.startsWith(expectedTargetPrefix)) {
                        return {
                            artifactPath: candidate,
                            staleReference: match
                        }
                    }
                }
            }
        }
    }

    return null
}

function main() {
    const staleArtifact = findStaleBuildArtifact()
    if (!staleArtifact) {
        return
    }

    console.log('[desktop] Detected stale Tauri target cache from a different workspace.')
    console.log(`[desktop] Removing ${targetDir}`)
    console.log(`[desktop] Stale reference: ${staleArtifact.staleReference}`)
    rmSync(targetDir, { recursive: true, force: true })
}

main()
