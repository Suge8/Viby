import { describe, expect, it } from 'vitest'
import { buildRemotePeerRpcTelemetrySample } from './remotePeerRpcTelemetry'

describe('buildRemotePeerRpcTelemetrySample', () => {
    it('derives immutable RPC telemetry from request and outcome', () => {
        expect(
            buildRemotePeerRpcTelemetrySample(
                {
                    method: 'sessions.list',
                    route: 'relay',
                    startedAt: 10,
                    requestBytes: 20,
                    requestChunks: 2,
                },
                { ok: true, timedOut: false, response: { bytes: 30, chunks: 3 } },
                () => 45
            )
        ).toEqual({
            method: 'sessions.list',
            route: 'relay',
            durationMs: 35,
            ok: true,
            timedOut: false,
            requestBytes: 20,
            requestChunks: 2,
            responseBytes: 30,
            responseChunks: 3,
            sampledAt: 45,
        })
    })
})
