import { describe, expect, it, mock } from 'bun:test'
import { createPairingPeerTextAssembler, PAIRING_PEER_TEXT_CHUNK_BYTES } from '@viby/protocol/pairing'
import { handlePairingPeerPayload, type PairingPeerTextSink } from './pairingBridgeControllerSupport'

function createLargeSession(index: number) {
    return {
        id: `session-${index}`,
        active: true,
        thinking: false,
        updatedAt: index + 1,
        latestActivityAt: index + 1,
        lifecycleState: 'running',
        resumeAvailable: true,
        model: null,
        codexServiceTier: null,
        metadata: { path: `/repo/${'nested/'.repeat(120)}${index}` },
    }
}

describe('pairing bridge text frames', () => {
    it('chunks large DataChannel RPC responses', async () => {
        const sent: string[] = []
        const sink: PairingPeerTextSink = {
            readyState: 'open',
            textChunkBytes: PAIRING_PEER_TEXT_CHUNK_BYTES,
            send: (data) => sent.push(data),
        }

        await handlePairingPeerPayload({
            data: JSON.stringify({ kind: 'request', id: 'r1', method: 'sessions.list', params: {} }),
            getClient: () =>
                ({
                    listSessions: mock(async () =>
                        Array.from({ length: 240 }, (_, index) => createLargeSession(index))
                    ),
                    acceptUploadChunk: mock(async () => false),
                }) as never,
            onActive: mock(() => undefined),
            sink,
        })

        const assembler = createPairingPeerTextAssembler()
        const assembled = sent.map((frame) => assembler.accept(frame)).filter((value) => value !== null)
        expect(sent.length).toBeGreaterThan(1)
        expect(JSON.parse(assembled[0] ?? '{}')).toMatchObject({ kind: 'response', id: 'r1', ok: true })
    })
})
