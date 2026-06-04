import { describe, expect, it, vi } from 'vitest'
import type { ProviderAdapterBridge } from './providerAdapterBridge'
import { ProviderAdapterStdoutProcessor } from './providerAdapterStdoutProcessor'

function runtimeEvent(sessionId: string): string {
    return `${JSON.stringify({ type: 'runtime.command-capabilities-invalidated', sessionId })}\n`
}

function createProcessor(
    options: {
        handleEvent?: ProviderAdapterBridge['handleEvent']
        maxLineBytes?: number
        pause?: () => void
        resume?: () => void
        onFatal?: (message: string) => void
    } = {}
) {
    const bridge = {
        handleEvent: options.handleEvent ?? vi.fn(async () => undefined),
        registerSession: vi.fn(),
    } as unknown as ProviderAdapterBridge
    const onFatal = options.onFatal ?? vi.fn()
    return {
        bridge,
        onFatal,
        processor: new ProviderAdapterStdoutProcessor({
            bridge,
            onSessionStarted: vi.fn(),
            onFatal,
            maxLineBytes: options.maxLineBytes,
            pause: options.pause,
            resume: options.resume,
        }),
    }
}

describe('ProviderAdapterStdoutProcessor', () => {
    it('ingests provider events serially in stdout order', async () => {
        let releaseFirst!: () => void
        const firstDone = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const handleEvent = vi.fn((event: { sessionId: string }) =>
            event.sessionId === 'first' ? firstDone : Promise.resolve()
        ) as unknown as ProviderAdapterBridge['handleEvent']
        const { processor } = createProcessor({ handleEvent })

        processor.push(`${runtimeEvent('first')}${runtimeEvent('second')}`)
        await Promise.resolve()

        expect(handleEvent).toHaveBeenCalledTimes(1)
        expect(handleEvent).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'first' }))

        releaseFirst()
        await processor.drain()

        expect(handleEvent).toHaveBeenCalledTimes(2)
        expect(handleEvent).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: 'second' }))
    })

    it('fails closed when a provider stdout line exceeds the byte cap', async () => {
        const { bridge, onFatal, processor } = createProcessor({ maxLineBytes: 8 })

        processor.push(
            `${JSON.stringify({ type: 'runtime.command-capabilities-invalidated', sessionId: 'too-long' })}\n`
        )
        await processor.drain()

        expect(onFatal).toHaveBeenCalledWith('Provider adapter stdout line exceeded 8 bytes')
        expect(bridge.handleEvent).not.toHaveBeenCalled()
    })

    it('reports partial trailing stdout as a protocol violation', () => {
        const { onFatal, processor } = createProcessor()

        processor.push('{"type"')
        processor.finish()

        expect(onFatal).toHaveBeenCalledWith('Provider adapter stdout ended with a partial line: line="{\\"type\\""')
    })

    it('pauses and resumes stdout around a saturated ingest queue', async () => {
        let releaseFirst!: () => void
        const firstDone = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        const pause = vi.fn()
        const resume = vi.fn()
        const handleEvent = vi.fn((event: { sessionId: string }) =>
            event.sessionId === '0' ? firstDone : Promise.resolve()
        ) as unknown as ProviderAdapterBridge['handleEvent']
        const { processor } = createProcessor({ handleEvent, pause, resume })
        const payload = Array.from({ length: 257 }, (_, index) => runtimeEvent(String(index))).join('')

        processor.push(payload)
        await Promise.resolve()

        expect(pause).toHaveBeenCalled()
        releaseFirst()
        await processor.drain()

        expect(handleEvent).toHaveBeenCalledTimes(257)
        expect(resume).toHaveBeenCalled()
    })
})
