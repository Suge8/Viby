import type { LocalHubPairingRequestJson } from './localHubPairingRequest'

export type GitCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type FileSearchResponse = {
    success: boolean
    files?: Array<{
        fileName: string
        filePath: string
        fullPath: string
        fileType: 'file' | 'folder'
    }>
    error?: string
}

export type FileReadResponse = {
    success: boolean
    content?: string
    error?: string
}

export type ListDirectoryResponse = {
    success: boolean
    entries?: Array<{
        name: string
        type: 'file' | 'directory' | 'other'
        size?: number
        modified?: number
    }>
    error?: string
}

export async function getGitStatus(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string
): Promise<GitCommandResponse> {
    return await requestJson<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-status`)
}

export async function getGitDiffNumstat(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    staged: boolean
): Promise<GitCommandResponse> {
    const query = new URLSearchParams({ staged: staged ? 'true' : 'false' }).toString()
    return await requestJson<GitCommandResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/git-diff-numstat?${query}`
    )
}

export async function getGitDiffFile(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    path: string,
    staged?: boolean
): Promise<GitCommandResponse> {
    const params = new URLSearchParams({ path })
    if (staged !== undefined) {
        params.set('staged', staged ? 'true' : 'false')
    }
    return await requestJson<GitCommandResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/git-diff-file?${params.toString()}`
    )
}

export async function searchSessionFiles(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    query: string,
    limit?: number
): Promise<FileSearchResponse> {
    const params = new URLSearchParams()
    if (query) {
        params.set('query', query)
    }
    if (limit !== undefined) {
        params.set('limit', `${limit}`)
    }
    const suffix = params.size > 0 ? `?${params.toString()}` : ''
    return await requestJson<FileSearchResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/files${suffix}`)
}

export async function readSessionFile(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    path: string
): Promise<FileReadResponse> {
    const query = new URLSearchParams({ path }).toString()
    return await requestJson<FileReadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file?${query}`)
}

export async function listSessionDirectory(
    requestJson: LocalHubPairingRequestJson,
    sessionId: string,
    path?: string
): Promise<ListDirectoryResponse> {
    const query = path ? `?${new URLSearchParams({ path }).toString()}` : ''
    return await requestJson<ListDirectoryResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/directory${query}`)
}
