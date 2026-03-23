import { stat } from 'node:fs/promises'

export interface PathExistsRequest {
    paths: string[]
}

export interface PathExistsResponse {
    exists: Record<string, boolean>
}

export async function handlePathExistsRequest(params: PathExistsRequest | null | undefined): Promise<PathExistsResponse> {
    const rawPaths = Array.isArray(params?.paths) ? params.paths : []
    const uniquePaths = Array.from(new Set(rawPaths.filter((path): path is string => typeof path === 'string')))
    const exists: Record<string, boolean> = {}

    await Promise.all(uniquePaths.map(async (path) => {
        const trimmed = path.trim()
        if (!trimmed) {
            return
        }

        try {
            const stats = await stat(trimmed)
            exists[trimmed] = stats.isDirectory()
        } catch {
            exists[trimmed] = false
        }
    }))

    return { exists }
}
