import { describe, expect, it } from 'bun:test'
import { SESSION_ATTACHMENT_MAX_UPLOAD_BYTES } from '../attachmentUpload'
import {
    PairingPeerMessageSchema,
    PairingPeerPushSubscriptionParamsSchema,
    PairingPeerTerminalEventPayloadSchema,
    PairingPeerUploadCompleteParamsSchema,
    PairingPeerUploadResultSchema,
    PairingPeerUploadStartParamsSchema,
} from './schema'

const TRANSFER_ID = '00000000-0000-4000-8000-000000000001'

describe('pairing peer extended mobile capability schemas', () => {
    it('accepts the upload start contract used before binary chunk frames', () => {
        expect(
            PairingPeerUploadStartParamsSchema.parse({
                sessionId: 'session-1',
                transferId: TRANSFER_ID,
                filename: 'photo.heic',
                mimeType: 'image/heic',
                size: 1024,
            })
        ).toEqual({
            sessionId: 'session-1',
            transferId: TRANSFER_ID,
            filename: 'photo.heic',
            mimeType: 'image/heic',
            size: 1024,
        })
    })

    it('rejects upload start without a stable transfer id', () => {
        expect(() =>
            PairingPeerUploadStartParamsSchema.parse({
                sessionId: 'session-1',
                transferId: 'not-a-uuid',
                filename: 'photo.heic',
                mimeType: 'image/heic',
                size: 1024,
            })
        ).toThrow()
    })

    it('rejects negative upload sizes before the desktop allocates buffers', () => {
        expect(() =>
            PairingPeerUploadStartParamsSchema.parse({
                sessionId: 'session-1',
                transferId: TRANSFER_ID,
                filename: 'photo.heic',
                mimeType: 'image/heic',
                size: -1,
            })
        ).toThrow()
    })

    it('rejects upload sizes above the shared attachment limit', () => {
        expect(() =>
            PairingPeerUploadStartParamsSchema.parse({
                sessionId: 'session-1',
                transferId: TRANSFER_ID,
                filename: 'large.bin',
                mimeType: 'application/octet-stream',
                size: SESSION_ATTACHMENT_MAX_UPLOAD_BYTES + 1,
            })
        ).toThrow()
    })

    it('accepts upload complete only with the matching session and transfer ids', () => {
        expect(
            PairingPeerUploadCompleteParamsSchema.parse({
                sessionId: 'session-1',
                transferId: TRANSFER_ID,
            })
        ).toEqual({
            sessionId: 'session-1',
            transferId: TRANSFER_ID,
        })
    })

    it('keeps upload results aligned with the normal Hub upload response', () => {
        expect(PairingPeerUploadResultSchema.parse({ success: true, path: '/tmp/uploaded.png' })).toEqual({
            success: true,
            path: '/tmp/uploaded.png',
        })
        expect(PairingPeerUploadResultSchema.parse({ success: false, error: 'too large' })).toEqual({
            success: false,
            error: 'too large',
        })
    })

    it('accepts terminal ready events with a session owner', () => {
        expect(
            PairingPeerTerminalEventPayloadSchema.parse({
                type: 'ready',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
            })
        ).toEqual({
            type: 'ready',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
        })
    })

    it('accepts terminal output as untrusted bytes carried in an event envelope', () => {
        const parsed = PairingPeerTerminalEventPayloadSchema.parse({
            type: 'output',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            data: '\u001b[32mok\u001b[0m',
        })

        expect(parsed).toMatchObject({ type: 'output', data: '\u001b[32mok\u001b[0m' })
    })

    it('accepts terminal exit without turning it into a DataChannel close', () => {
        expect(
            PairingPeerTerminalEventPayloadSchema.parse({
                type: 'exit',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
                code: null,
                signal: 'SIGTERM',
            })
        ).toMatchObject({
            type: 'exit',
            signal: 'SIGTERM',
        })
    })

    it('accepts terminal errors as terminal-scoped events', () => {
        expect(
            PairingPeerTerminalEventPayloadSchema.parse({
                type: 'error',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
                message: 'CLI disconnected.',
            })
        ).toMatchObject({
            type: 'error',
            message: 'CLI disconnected.',
        })
    })

    it('rejects terminal events without a session id', () => {
        expect(() =>
            PairingPeerTerminalEventPayloadSchema.parse({
                type: 'output',
                terminalId: 'terminal-1',
                data: 'missing session',
            })
        ).toThrow()
    })

    it('accepts Web Push subscriptions generated by the phone PushManager', () => {
        expect(
            PairingPeerPushSubscriptionParamsSchema.parse({
                endpoint: 'https://push.example/device-1',
                keys: {
                    p256dh: 'p256dh-key',
                    auth: 'auth-secret',
                },
            })
        ).toEqual({
            endpoint: 'https://push.example/device-1',
            keys: {
                p256dh: 'p256dh-key',
                auth: 'auth-secret',
            },
        })
    })

    it('rejects Web Push subscriptions without endpoint ownership', () => {
        expect(() =>
            PairingPeerPushSubscriptionParamsSchema.parse({
                endpoint: '',
                keys: {
                    p256dh: 'p256dh-key',
                    auth: 'auth-secret',
                },
            })
        ).toThrow()
    })

    it('accepts upload lifecycle peer requests', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'upload-start',
                method: 'session.upload-start',
                params: {
                    sessionId: 'session-1',
                    transferId: TRANSFER_ID,
                    filename: 'photo.heic',
                    mimeType: 'image/heic',
                    size: 1024,
                },
            }).kind
        ).toBe('request')
    })

    it('accepts terminal peer requests', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'terminal-resize',
                method: 'terminal.resize',
                params: { sessionId: 'session-1', terminalId: 'terminal-1', cols: 120, rows: 40 },
            }).kind
        ).toBe('request')
    })

    it('accepts push peer requests', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'push-key',
                method: 'push.vapid-public-key',
                params: {},
            }).kind
        ).toBe('request')
    })

    it('accepts push unsubscribe peer requests', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'push-unsubscribe',
                method: 'push.unsubscribe',
                params: {
                    endpoint: 'https://push.example/device-1',
                },
            }).kind
        ).toBe('request')
    })

    it('accepts upload cancel peer requests for cleanup', () => {
        expect(
            PairingPeerMessageSchema.parse({
                kind: 'request',
                id: 'upload-cancel',
                method: 'session.upload-cancel',
                params: {
                    transferId: TRANSFER_ID,
                },
            }).kind
        ).toBe('request')
    })
})
