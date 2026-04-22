import { vi } from 'vitest'

export type QueuedAnimationFrameHarness = {
    flushNextFrame: () => void
    flushAllFrames: () => void
    restore: () => void
}

export function installQueuedAnimationFrameHarness(): QueuedAnimationFrameHarness {
    const queuedFrames = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    const previousRequestAnimationFrame = globalThis.requestAnimationFrame
    const previousCancelAnimationFrame = globalThis.cancelAnimationFrame

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        const frameId = nextFrameId
        nextFrameId += 1
        queuedFrames.set(frameId, callback)
        return frameId
    }) as typeof globalThis.requestAnimationFrame
    globalThis.cancelAnimationFrame = ((frameId: number) => {
        queuedFrames.delete(frameId)
    }) as typeof globalThis.cancelAnimationFrame

    return {
        flushNextFrame: () => {
            const nextEntry = queuedFrames.entries().next()
            if (nextEntry.done) {
                return
            }

            const [frameId, callback] = nextEntry.value
            queuedFrames.delete(frameId)
            callback(0)
        },
        flushAllFrames: () => {
            while (queuedFrames.size > 0) {
                const callbacks = [...queuedFrames.values()]
                queuedFrames.clear()
                for (const callback of callbacks) {
                    callback(0)
                }
            }
        },
        restore: () => {
            globalThis.requestAnimationFrame = previousRequestAnimationFrame
            globalThis.cancelAnimationFrame = previousCancelAnimationFrame
            vi.restoreAllMocks()
        },
    }
}
