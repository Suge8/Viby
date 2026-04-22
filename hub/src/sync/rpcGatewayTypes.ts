import type { MachineDirectoryEntry, MachineDirectoryRoot } from '@viby/protocol/types'

export type RpcCommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

export type RpcReadFileResponse = {
    success: boolean
    content?: string
    error?: string
}

export type RpcUploadFileResponse = {
    success: boolean
    path?: string
    error?: string
}

export type RpcDeleteUploadResponse = {
    success: boolean
    error?: string
}

export type RpcListDirectoryResponse = {
    success: boolean
    entries?: Array<{
        name: string
        type: 'file' | 'directory' | 'other'
        size?: number
        modified?: number
    }>
    error?: string
}

export type RpcMachineDirectoryResponse = {
    success: boolean
    currentPath?: string
    parentPath?: string | null
    entries?: MachineDirectoryEntry[]
    roots?: MachineDirectoryRoot[]
    error?: string
}

export type RpcPathExistsResponse = {
    exists: Record<string, boolean>
}
