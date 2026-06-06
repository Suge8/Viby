import { describe, expect, it } from 'bun:test'
import { type PairingHostEvent, PairingSessionRecordSchema, toPairingSessionSnapshot } from '@viby/protocol/pairing'
import { createPairingHostEventStream } from './hostEventStream'
import { createParticipantRecord } from './httpSupport'
import { MemoryPairingStore } from './memoryStore'
import { PairingSessionEventBus } from './sessionEventBus'

const NOW = 1_700_000_000_000

function createSession(updatedAt = NOW) {
    return PairingSessionRecordSchema.parse({
        id: 'pairing-1',
        state: 'waiting',
        createdAt: NOW,
        updatedAt,
        expiresAt: NOW + 3_600_000,
        shortCode: '123456',
        approvalStatus: null,
        host: createParticipantRecord({ token: 'host-token', label: 'Desk' }),
        authorizedDevice: null,
    })
}

function createHostEvent(updatedAt: number): PairingHostEvent {
    return {
        type: 'pairing.updated',
        pairing: toPairingSessionSnapshot(createSession(updatedAt)),
        remoteConnections: [],
    }
}

async function createStream(keepaliveIntervalMs = 25_000) {
    const store = new MemoryPairingStore(() => NOW)
    const eventBus = new PairingSessionEventBus()
    await store.createSession(createSession())
    const abortController = new AbortController()
    const iterator = createPairingHostEventStream({
        pairingId: 'pairing-1',
        store,
        eventBus,
        signal: abortController.signal,
        keepaliveIntervalMs,
    })

    return { abortController, eventBus, iterator }
}

async function nextWithBudget(iterator: AsyncIterator<unknown>, budgetMs = 500) {
    return await Promise.race([
        iterator.next(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('iterator budget exceeded')), budgetMs)),
    ])
}

describe('pairing host event stream', () => {
    it('emits the initial snapshot first', async () => {
        const { abortController, iterator } = await createStream()

        const first = await nextWithBudget(iterator)

        expect(first.value).toMatchObject({
            type: 'event',
            event: { type: 'pairing.updated', pairing: { id: 'pairing-1', approvalStatus: null } },
        })
        abortController.abort()
    })

    it('emits eventBus increments in order after the initial snapshot', async () => {
        const { abortController, eventBus, iterator } = await createStream()
        await nextWithBudget(iterator)

        eventBus.emit(createHostEvent(NOW + 1))
        eventBus.emit(createHostEvent(NOW + 2))

        const firstIncrement = await nextWithBudget(iterator)
        const secondIncrement = await nextWithBudget(iterator)

        expect(firstIncrement.value).toMatchObject({ type: 'event', event: { pairing: { updatedAt: NOW + 1 } } })
        expect(secondIncrement.value).toMatchObject({ type: 'event', event: { pairing: { updatedAt: NOW + 2 } } })
        abortController.abort()
    })

    it('emits keepalive when no event arrives', async () => {
        const { abortController, iterator } = await createStream(1)
        await nextWithBudget(iterator)

        const keepalive = await nextWithBudget(iterator)

        expect(keepalive.value).toEqual({ type: 'keepalive' })
        abortController.abort()
    })

    it('unsubscribes when aborted', async () => {
        const { abortController, eventBus, iterator } = await createStream()
        await nextWithBudget(iterator)
        expect(eventBus.listenerCount('pairing-1')).toBe(1)

        abortController.abort()
        const next = await nextWithBudget(iterator)

        expect(eventBus.listenerCount('pairing-1')).toBe(0)
        expect(next.done).toBe(true)
    })
})
