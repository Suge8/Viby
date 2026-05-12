import type { PairingPeerRequest, PairingPeerResponse, PairingPeerTerminalEventPayload } from '@viby/protocol/pairing'
import {
    PairingPeerDeleteUploadResultSchema,
    PairingPeerFileReadResultSchema,
    PairingPeerFileSearchResultSchema,
    PairingPeerGitCommandResultSchema,
    PairingPeerListDirectoryResultSchema,
    PairingPeerOkResultSchema,
    PairingPeerPushVapidResultSchema,
    PairingPeerUploadResultSchema,
} from '@viby/protocol/pairing'
import type { LocalHubPairingClient } from './localHubPairingClient'
import { successResponse } from './pairingPeerResponseSupport'

export async function executePairingPeerPeripheralRequest(
    client: LocalHubPairingClient,
    request: PairingPeerRequest,
    options: { emitTerminalEvent?: (event: PairingPeerTerminalEventPayload) => void } = {}
): Promise<PairingPeerResponse | null> {
    switch (request.method) {
        case 'workspace.git-status':
            return successResponse(
                request.id,
                PairingPeerGitCommandResultSchema.parse(await client.getGitStatus(request.params.sessionId))
            )
        case 'workspace.git-diff-numstat':
            return successResponse(
                request.id,
                PairingPeerGitCommandResultSchema.parse(
                    await client.getGitDiffNumstat(request.params.sessionId, request.params.staged)
                )
            )
        case 'workspace.git-diff-file':
            return successResponse(
                request.id,
                PairingPeerGitCommandResultSchema.parse(
                    await client.getGitDiffFile(request.params.sessionId, request.params.path, request.params.staged)
                )
            )
        case 'workspace.search-files':
            return successResponse(
                request.id,
                PairingPeerFileSearchResultSchema.parse(
                    await client.searchSessionFiles(
                        request.params.sessionId,
                        request.params.query,
                        request.params.limit
                    )
                )
            )
        case 'workspace.read-file':
            return successResponse(
                request.id,
                PairingPeerFileReadResultSchema.parse(
                    await client.readSessionFile(request.params.sessionId, request.params.path)
                )
            )
        case 'workspace.list-directory':
            return successResponse(
                request.id,
                PairingPeerListDirectoryResultSchema.parse(
                    await client.listSessionDirectory(request.params.sessionId, request.params.path)
                )
            )
        case 'session.delete-upload':
            return successResponse(
                request.id,
                PairingPeerDeleteUploadResultSchema.parse(
                    await client.deleteUploadFile(request.params.sessionId, request.params.path)
                )
            )
        case 'session.upload-start':
            client.beginUpload(request.params)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'session.upload-complete':
            return successResponse(
                request.id,
                PairingPeerUploadResultSchema.parse(await client.completeUpload(request.params))
            )
        case 'session.upload-cancel':
            client.cancelUpload(request.params.transferId)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'terminal.open':
            await client.openTerminal(request.params, options.emitTerminalEvent ?? (() => undefined))
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'terminal.write':
            client.writeTerminal(request.params.sessionId, request.params.terminalId, request.params.data)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'terminal.resize':
            client.resizeTerminal(
                request.params.sessionId,
                request.params.terminalId,
                request.params.cols,
                request.params.rows
            )
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'terminal.close':
            client.closeTerminal(request.params.sessionId, request.params.terminalId)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'push.vapid-public-key':
            return successResponse(
                request.id,
                PairingPeerPushVapidResultSchema.parse(await client.getPushVapidPublicKey())
            )
        case 'push.subscribe':
            await client.subscribePushNotifications(request.params)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        case 'push.unsubscribe':
            await client.unsubscribePushNotifications(request.params)
            return successResponse(request.id, PairingPeerOkResultSchema.parse({ ok: true }))
        default:
            return null
    }
}
