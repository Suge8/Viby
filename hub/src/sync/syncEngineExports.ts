import type { SessionSendMessageErrorCode } from './sessionInteractionService'

export type { Session, SyncEvent } from '@viby/protocol/types'
export type { SyncEventListener } from './eventPublisher'
export type { Machine } from './machineCache'
export type {
    RpcCommandResponse,
    RpcDeleteUploadResponse,
    RpcListDirectoryResponse,
    RpcMachineDirectoryResponse,
    RpcPathExistsResponse,
    RpcReadFileResponse,
    RpcUploadFileResponse,
} from './rpcGateway'
export { SessionHandoffBuildError } from './sessionHandoffService'
export type { DriverSwitchResult } from './sessionLifecycleService'

export class SessionSendMessageError extends Error {
    readonly code: SessionSendMessageErrorCode
    readonly status: 404 | 409

    constructor(message: string, code: SessionSendMessageErrorCode, status: 404 | 409) {
        super(message)
        this.name = 'SessionSendMessageError'
        this.code = code
        this.status = status
    }
}
