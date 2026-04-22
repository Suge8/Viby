import type {
    DeleteUploadResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    ListDirectoryResponse,
    UploadFileResponse,
} from '@/types/api'
import type { ApiClientRequest } from './client'

export async function getGitStatus(request: ApiClientRequest, sessionId: string): Promise<GitCommandResponse> {
    return await request<GitCommandResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/git-status`)
}

export async function getGitDiffNumstat(
    request: ApiClientRequest,
    sessionId: string,
    staged: boolean
): Promise<GitCommandResponse> {
    const params = new URLSearchParams()
    params.set('staged', staged ? 'true' : 'false')
    return await request<GitCommandResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/git-diff-numstat?${params.toString()}`
    )
}

export async function getGitDiffFile(
    request: ApiClientRequest,
    sessionId: string,
    path: string,
    staged?: boolean
): Promise<GitCommandResponse> {
    const params = new URLSearchParams()
    params.set('path', path)
    if (staged !== undefined) {
        params.set('staged', staged ? 'true' : 'false')
    }
    return await request<GitCommandResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/git-diff-file?${params.toString()}`
    )
}

export async function searchSessionFiles(
    request: ApiClientRequest,
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
    const qs = params.toString()
    return await request<FileSearchResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/files${qs ? `?${qs}` : ''}`
    )
}

export async function readSessionFile(
    request: ApiClientRequest,
    sessionId: string,
    path: string
): Promise<FileReadResponse> {
    const params = new URLSearchParams()
    params.set('path', path)
    return await request<FileReadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/file?${params.toString()}`)
}

export async function listSessionDirectory(
    request: ApiClientRequest,
    sessionId: string,
    path?: string
): Promise<ListDirectoryResponse> {
    const params = new URLSearchParams()
    if (path) {
        params.set('path', path)
    }

    const qs = params.toString()
    return await request<ListDirectoryResponse>(
        `/api/sessions/${encodeURIComponent(sessionId)}/directory${qs ? `?${qs}` : ''}`
    )
}

export async function uploadFile(
    request: ApiClientRequest,
    sessionId: string,
    file: File,
    mimeType: string
): Promise<UploadFileResponse> {
    const formData = new FormData()
    formData.append('file', file, file.name)
    formData.append('mimeType', mimeType)

    return await request<UploadFileResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload`, {
        method: 'POST',
        body: formData,
    })
}

export async function deleteUploadFile(
    request: ApiClientRequest,
    sessionId: string,
    path: string
): Promise<DeleteUploadResponse> {
    return await request<DeleteUploadResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/upload/delete`, {
        method: 'POST',
        body: JSON.stringify({ path }),
    })
}
