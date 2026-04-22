export interface JsonRpcRequest {
    jsonrpc: '2.0'
    id: string | number | null
    method: string
    params?: unknown
}

export type JsonRpcNotification = {
    jsonrpc: '2.0'
    method: string
    params?: unknown
}

export interface JsonRpcResponse {
    jsonrpc: '2.0'
    id: string | number | null
    result?: unknown
    error?: {
        code: number
        message: string
        data?: unknown
    }
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

export function parseJsonRpcMessage(line: string): JsonRpcMessage | null {
    const parsed = JSON.parse(line)
    return typeof parsed === 'object' && parsed !== null ? (parsed as JsonRpcMessage) : null
}
