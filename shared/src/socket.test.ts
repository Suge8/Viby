import { describe, expect, it } from 'bun:test'
import { SessionRuntimeStatePayloadSchema } from './socket'

describe('socket contracts', () => {
    it('accepts session runtime stopping payloads', () => {
        expect(
            SessionRuntimeStatePayloadSchema.parse({
                sid: 'session-1',
                time: 1_000,
                state: 'stopping',
                reason: 'idle-timeout',
            })
        ).toEqual({
            sid: 'session-1',
            time: 1_000,
            state: 'stopping',
            reason: 'idle-timeout',
        })
    })

    it('rejects non-stopping runtime states', () => {
        expect(
            SessionRuntimeStatePayloadSchema.safeParse({
                sid: 'session-1',
                time: 1_000,
                state: 'active',
            }).success
        ).toBe(false)
    })
})
