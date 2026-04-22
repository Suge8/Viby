import type {
    DeleteUploadResponse,
    FileReadResponse,
    FileSearchResponse,
    GitCommandResponse,
    ListDirectoryResponse,
    UploadFileResponse,
} from '@/types/api'
import type { ApiClientRequest } from './client'
import {
    deleteUploadFile,
    getGitDiffFile,
    getGitDiffNumstat,
    getGitStatus,
    listSessionDirectory,
    readSessionFile,
    searchSessionFiles,
    uploadFile,
} from './clientWorkspace'

export function createApiClientWorkspaceMethods(request: ApiClientRequest) {
    return {
        async getGitStatus(sessionId: string): Promise<GitCommandResponse> {
            return await getGitStatus(request, sessionId)
        },
        async getGitDiffNumstat(sessionId: string, staged: boolean): Promise<GitCommandResponse> {
            return await getGitDiffNumstat(request, sessionId, staged)
        },
        async getGitDiffFile(sessionId: string, path: string, staged?: boolean): Promise<GitCommandResponse> {
            return await getGitDiffFile(request, sessionId, path, staged)
        },
        async searchSessionFiles(sessionId: string, query: string, limit?: number): Promise<FileSearchResponse> {
            return await searchSessionFiles(request, sessionId, query, limit)
        },
        async readSessionFile(sessionId: string, path: string): Promise<FileReadResponse> {
            return await readSessionFile(request, sessionId, path)
        },
        async listSessionDirectory(sessionId: string, path?: string): Promise<ListDirectoryResponse> {
            return await listSessionDirectory(request, sessionId, path)
        },
        async uploadFile(sessionId: string, file: File, mimeType: string): Promise<UploadFileResponse> {
            return await uploadFile(request, sessionId, file, mimeType)
        },
        async deleteUploadFile(sessionId: string, path: string): Promise<DeleteUploadResponse> {
            return await deleteUploadFile(request, sessionId, path)
        },
    }
}
