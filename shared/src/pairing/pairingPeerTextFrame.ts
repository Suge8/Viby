import { z } from 'zod'
import { fromPairingTunnelBase64Url, toPairingTunnelBase64Url } from './pairingTunnelCrypto'

export const PAIRING_PEER_TEXT_MAX_FRAME_BYTES = 16 * 1024
export const PAIRING_PEER_TEXT_CHUNK_BYTES = 11 * 1024
export const PAIRING_PEER_TEXT_BUFFER_HIGH_BYTES = 64 * 1024
export const PAIRING_PEER_TEXT_BUFFER_LOW_BYTES = 16 * 1024
const PAIRING_PEER_TEXT_MAX_CHUNKS = 4096
const PAIRING_PEER_TEXT_MAX_PENDING_MESSAGES = 64
const PAIRING_PEER_TEXT_CHUNK_KIND = 'peer-text-chunk'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export const PairingPeerTextChunkFrameSchema = z
    .object({
        kind: z.literal(PAIRING_PEER_TEXT_CHUNK_KIND),
        id: z.string().min(1),
        index: z.number().int().nonnegative(),
        count: z.number().int().positive().max(PAIRING_PEER_TEXT_MAX_CHUNKS),
        bytesBase64: z.string().min(1),
    })
    .refine((frame) => frame.index < frame.count, 'chunk index must be smaller than chunk count')

export type PairingPeerTextChunkFrame = z.infer<typeof PairingPeerTextChunkFrameSchema>
export type PairingPeerTextAssembler = ReturnType<typeof createPairingPeerTextAssembler>
export type PairingPeerTextPriority = 'urgent' | 'interactive' | 'bulk'
export type PairingPeerTextSendReceipt = { bytes: number; chunks: number }
export type PairingPeerTextSendPlan = PairingPeerTextSendReceipt & { frames: string[] }

export type PairingPeerTextWritable = {
    readonly readyState: string | number
    bufferedAmount?: number
    bufferedAmountLowThreshold?: number
    addEventListener?: (type: string, listener: () => void, options?: unknown) => void
    removeEventListener?: (type: string, listener: () => void) => void
    send(data: string): void
}

export type PairingPeerTextSender = ReturnType<typeof createPairingPeerTextSender>

type PendingText = {
    count: number
    chunks: string[]
    received: number
}

type QueuedText = PairingPeerTextSendPlan & {
    index: number
    priority: PairingPeerTextPriority
    resolve: (receipt: PairingPeerTextSendReceipt) => void
    reject: (error: Error) => void
}

function createChunkId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `peer-text-${Date.now()}-${Math.random()}`
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

function isChunkCandidate(value: unknown): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        (value as { kind?: unknown }).kind === PAIRING_PEER_TEXT_CHUNK_KIND
    )
}

export function measurePairingPeerTextMessage(
    text: string,
    chunkBytes = PAIRING_PEER_TEXT_CHUNK_BYTES
): PairingPeerTextSendReceipt {
    const bytes = textEncoder.encode(text).byteLength
    const chunks = Math.max(1, Math.ceil(bytes / chunkBytes))
    if (chunks > PAIRING_PEER_TEXT_MAX_CHUNKS) throw new Error('Pairing peer text message is too large.')
    return { bytes, chunks }
}

export function createPairingPeerTextSendPlan(
    text: string,
    chunkBytes = PAIRING_PEER_TEXT_CHUNK_BYTES
): PairingPeerTextSendPlan {
    const bytes = textEncoder.encode(text)
    if (bytes.byteLength <= chunkBytes) return { bytes: bytes.byteLength, chunks: 1, frames: [text] }

    const count = Math.ceil(bytes.byteLength / chunkBytes)
    if (count > PAIRING_PEER_TEXT_MAX_CHUNKS) throw new Error('Pairing peer text message is too large.')

    const id = createChunkId()
    const frames: string[] = []
    for (let index = 0; index < count; index += 1) {
        const offset = index * chunkBytes
        const chunk = bytes.slice(offset, offset + chunkBytes)
        frames.push(
            JSON.stringify(
                PairingPeerTextChunkFrameSchema.parse({
                    kind: PAIRING_PEER_TEXT_CHUNK_KIND,
                    id,
                    index,
                    count,
                    bytesBase64: toPairingTunnelBase64Url(chunk),
                })
            )
        )
    }
    return { bytes: bytes.byteLength, chunks: frames.length, frames }
}

export function splitPairingPeerTextMessage(text: string, chunkBytes = PAIRING_PEER_TEXT_CHUNK_BYTES): string[] {
    return createPairingPeerTextSendPlan(text, chunkBytes).frames
}

function isWritableOpen(writable: PairingPeerTextWritable): boolean {
    return writable.readyState === 'open' || writable.readyState === 1
}

function getNextQueued(queues: Record<PairingPeerTextPriority, QueuedText[]>): QueuedText | null {
    return queues.urgent.shift() ?? queues.interactive.shift() ?? queues.bulk.shift() ?? null
}

function waitForWritableBuffer(
    writable: PairingPeerTextWritable,
    setAbort?: (abort: ((error: Error) => void) | null) => void
): Promise<void> {
    if (!isWritableOpen(writable)) return Promise.reject(new Error('pairing peer text transport is closed'))
    if (
        typeof writable.bufferedAmount !== 'number' ||
        writable.bufferedAmount <= PAIRING_PEER_TEXT_BUFFER_HIGH_BYTES ||
        !writable.addEventListener ||
        !writable.removeEventListener
    ) {
        return Promise.resolve()
    }

    writable.bufferedAmountLowThreshold = PAIRING_PEER_TEXT_BUFFER_LOW_BYTES
    return new Promise((resolve, reject) => {
        const cleanup = (): void => {
            writable.removeEventListener?.('bufferedamountlow', handleLow)
            writable.removeEventListener?.('close', handleClose)
            writable.removeEventListener?.('error', handleClose)
            setAbort?.(null)
        }
        const rejectClosed = (error: Error): void => {
            cleanup()
            reject(error)
        }
        const handleLow = (): void => {
            cleanup()
            resolve()
        }
        const handleClose = (): void => rejectClosed(new Error('pairing peer text transport is closed'))
        setAbort?.(rejectClosed)
        writable.addEventListener?.('bufferedamountlow', handleLow)
        writable.addEventListener?.('close', handleClose)
        writable.addEventListener?.('error', handleClose)
        if (
            typeof writable.bufferedAmount === 'number' &&
            writable.bufferedAmount <= PAIRING_PEER_TEXT_BUFFER_HIGH_BYTES
        ) {
            cleanup()
            resolve()
        }
    })
}

export function createPairingPeerTextSender(writable: PairingPeerTextWritable) {
    const queues: Record<PairingPeerTextPriority, QueuedText[]> = { urgent: [], interactive: [], bulk: [] }
    let draining = false
    let closedError: Error | null = null
    let abortBufferWait: ((error: Error) => void) | null = null

    function rejectAll(error: Error): void {
        for (const queue of Object.values(queues)) {
            for (const item of queue) item.reject(error)
            queue.length = 0
        }
    }

    function scheduleDrain(): void {
        if (draining) return
        draining = true
        const drainTask = drain().finally(() => {
            draining = false
            if (!closedError && getNextQueuedLength() > 0) scheduleDrain()
        })
        drainTask.catch((error) => {
            rejectAll(error instanceof Error ? error : new Error(String(error)))
        })
    }

    function getNextQueuedLength(): number {
        return queues.urgent.length + queues.interactive.length + queues.bulk.length
    }

    async function drain(): Promise<void> {
        for (let item = getNextQueued(queues); item; item = getNextQueued(queues)) {
            if (closedError) return item.reject(closedError)
            try {
                await waitForWritableBuffer(writable, (abort) => {
                    abortBufferWait = abort
                })
                if (closedError) return item.reject(closedError)
                writable.send(item.frames[item.index] ?? '')
                item.index += 1
                if (item.index >= item.frames.length) item.resolve({ bytes: item.bytes, chunks: item.chunks })
                else queues[item.priority].push(item)
            } catch (error) {
                item.reject(error instanceof Error ? error : new Error(String(error)))
            } finally {
                abortBufferWait = null
            }
        }
    }

    return {
        close(error = new Error('pairing peer text transport is closed')): void {
            closedError = error
            abortBufferWait?.(error)
            rejectAll(error)
        },
        send(
            text: string,
            options: { chunkBytes?: number; priority?: PairingPeerTextPriority } = {}
        ): Promise<PairingPeerTextSendReceipt> {
            if (closedError) return Promise.reject(closedError)
            const priority = options.priority ?? 'interactive'
            let plan: PairingPeerTextSendPlan
            try {
                plan = createPairingPeerTextSendPlan(text, options.chunkBytes)
            } catch (error) {
                return Promise.reject(error instanceof Error ? error : new Error(String(error)))
            }
            return new Promise((resolve, reject) => {
                queues[priority].push({ ...plan, index: 0, priority, resolve, reject })
                scheduleDrain()
            })
        },
    }
}

export function createPairingPeerTextAssembler(options: { maxPendingMessages?: number } = {}) {
    const pending = new Map<string, PendingText>()
    const maxPendingMessages = Math.max(1, options.maxPendingMessages ?? PAIRING_PEER_TEXT_MAX_PENDING_MESSAGES)

    function prunePendingCapacity(): void {
        while (pending.size >= maxPendingMessages) {
            const oldestId = pending.keys().next().value
            if (!oldestId) return
            pending.delete(oldestId)
        }
    }

    return {
        accept(raw: string): string | null {
            const value = parseJson(raw)
            if (!isChunkCandidate(value)) return raw

            const parsed = PairingPeerTextChunkFrameSchema.safeParse(value)
            if (!parsed.success) return null

            const frame = parsed.data
            let record = pending.get(frame.id)
            if (record?.count !== frame.count) {
                pending.delete(frame.id)
                if (frame.index !== 0) return null
                prunePendingCapacity()
                record = { count: frame.count, chunks: new Array(frame.count), received: 0 }
                pending.set(frame.id, record)
            }
            if (record.chunks[frame.index] === undefined) {
                record.chunks[frame.index] = frame.bytesBase64
                record.received += 1
            }
            if (record.received !== record.count) return null

            pending.delete(frame.id)
            try {
                return joinChunks(record.chunks)
            } catch {
                return null
            }
        },
    }
}

function joinChunks(chunks: readonly string[]): string {
    const decoded = chunks.map(fromPairingTunnelBase64Url)
    const totalBytes = decoded.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of decoded) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }
    return textDecoder.decode(bytes)
}
