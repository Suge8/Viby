import { describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { PiRpcConnectionError } from './piRpcProtocol'
import { runPiPromptLoop, subscribeToPiSessionEvents } from './runPiSupport'
import type { PiMode } from './types'

type PiEventListener = (event: Record<string, unknown>) => void

function requirePiEventListener(listener: PiEventListener | null): PiEventListener {
    if (!listener) {
        throw new Error('Pi event listener was not registered')
    }
    return listener
}

describe('subscribeToPiSessionEvents', () => {
    it('attaches the Pi assistant turn id to the durable assistant message meta', () => {
        let handler: PiEventListener | null = null
        const sendOutputMessage = vi.fn()
        const sendStreamUpdate = vi.fn()
        const onThinkingChange = vi.fn()

        const unsubscribe = subscribeToPiSessionEvents({
            piSession: { sendOutputMessage, sendStreamUpdate, onThinkingChange } as never,
            rpcClient: {
                onEvent(next: (event: Record<string, unknown>) => void) {
                    handler = next
                    return vi.fn()
                },
            } as never,
        })

        expect(handler).not.toBeNull()
        const assistantMessage = {
            role: 'assistant',
            api: 'pi',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            usage: {
                input: 1,
                output: 1,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: 1_000,
            content: [{ type: 'text', text: 'done' }],
        }

        const emitPiEvent = requirePiEventListener(handler)
        emitPiEvent({ type: 'message_start', message: assistantMessage })
        emitPiEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'done' } })
        emitPiEvent({ type: 'message_end', message: assistantMessage })

        expect(sendStreamUpdate).toHaveBeenCalledWith({
            kind: 'append',
            assistantTurnId: 'pi-assistant-1000',
            delta: 'done',
        })
        expect(sendOutputMessage).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'pi-assistant-1000' }), {
            assistantTurnId: 'pi-assistant-1000',
        })
        unsubscribe()
    })

    it('emits a durable terminal marker when Pi truncates a reply', () => {
        let handler: PiEventListener | null = null
        const sendSessionEvent = vi.fn()
        const assistantMessage = {
            role: 'assistant',
            api: 'pi',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            usage: {
                input: 1,
                output: 1,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'length',
            timestamp: 1_000,
            content: [{ type: 'text', text: 'partial' }],
        }

        subscribeToPiSessionEvents({
            piSession: { sendOutputMessage: vi.fn(), sendStreamUpdate: vi.fn(), sendSessionEvent } as never,
            rpcClient: {
                onEvent(next: (event: Record<string, unknown>) => void) {
                    handler = next
                    return vi.fn()
                },
            } as never,
        })

        requirePiEventListener(handler)({ type: 'message_end', message: assistantMessage })

        expect(sendSessionEvent).toHaveBeenCalledWith({
            type: 'turn-terminal',
            provider: 'pi',
            status: 'truncated',
            reason: 'length',
            assistantTurnId: 'pi-assistant-1000',
        })
    })

    it('clears stale Pi stream when final response id differs from the streamed id', () => {
        let handler: PiEventListener | null = null
        const sendOutputMessage = vi.fn()
        const sendStreamUpdate = vi.fn()
        const baseMessage = {
            role: 'assistant',
            api: 'pi',
            provider: 'openai',
            model: 'gpt-5.4-mini',
            usage: {
                input: 1,
                output: 1,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 2,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: 1_000,
            content: [{ type: 'text', text: 'done' }],
        }

        subscribeToPiSessionEvents({
            piSession: { sendOutputMessage, sendStreamUpdate, onThinkingChange: vi.fn() } as never,
            rpcClient: {
                onEvent(next: (event: Record<string, unknown>) => void) {
                    handler = next
                    return vi.fn()
                },
            } as never,
        })

        const emitPiEvent = requirePiEventListener(handler)
        emitPiEvent({ type: 'message_start', message: baseMessage })
        emitPiEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'done' } })
        emitPiEvent({ type: 'message_end', message: { ...baseMessage, responseId: 'response-1' } })

        expect(sendStreamUpdate).toHaveBeenCalledWith({
            kind: 'clear',
            assistantTurnId: 'pi-assistant-1000',
        })
        expect(sendOutputMessage).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'response-1' }), {
            assistantTurnId: 'response-1',
        })
    })

    it('does not drive thinking state from Pi RPC agent_start / agent_end events so the session card cannot flap when the Pi backend warms up multiple times per prompt (e.g. after switching to claude)', () => {
        let handler: PiEventListener | null = null
        const onThinkingChange = vi.fn()

        subscribeToPiSessionEvents({
            piSession: {
                sendOutputMessage: vi.fn(),
                sendStreamUpdate: vi.fn(),
                onThinkingChange,
            } as never,
            rpcClient: {
                onEvent(next: (event: Record<string, unknown>) => void) {
                    handler = next
                    return vi.fn()
                },
            } as never,
        })

        const emitPiEvent = requirePiEventListener(handler)
        emitPiEvent({ type: 'agent_start' })
        emitPiEvent({ type: 'agent_end' })
        emitPiEvent({ type: 'agent_start' })
        emitPiEvent({ type: 'agent_end' })

        expect(onThinkingChange).not.toHaveBeenCalled()
    })

    it('surfaces Pi transport failures without emitting false ready', async () => {
        const events: Array<Record<string, unknown>> = []
        const thinkingChanges: boolean[] = []
        const queue = new MessageQueue2<PiMode>((mode) => JSON.stringify(mode))
        queue.push('hello', { permissionMode: 'default', model: null, modelReasoningEffort: null })
        queue.close()

        await expect(
            runPiPromptLoop({
                session: {} as never,
                piSession: {
                    sendSessionEvent(event: Record<string, unknown>) {
                        events.push(event)
                    },
                    onThinkingChange(thinking: boolean) {
                        thinkingChanges.push(thinking)
                    },
                } as never,
                messageQueue: queue,
                rpcClient: {
                    prompt: vi.fn(async () => {
                        throw new PiRpcConnectionError('Pi RPC exited (1):')
                    }),
                } as never,
                applyRuntimeState: vi.fn(async () => {}),
                restoreSelectedRuntimeState: vi.fn(async () => {}),
                getAbortRequested: () => false,
                resetAbortRequested: vi.fn(),
            })
        ).rejects.toThrow('Pi RPC exited')

        expect(events).toEqual([
            { type: 'ready' },
            { type: 'assistant-error', detail: 'Pi turn failed: Pi RPC exited (1):' },
        ])
        expect(thinkingChanges).toEqual([true, false])
    })

    it('surfaces Pi turn failures as diagnostic assistant errors and still emits ready after settlement', async () => {
        const events: Array<Record<string, unknown>> = []
        const thinkingChanges: boolean[] = []
        const queue = new MessageQueue2<PiMode>((mode) => JSON.stringify(mode))
        queue.push('hello', { permissionMode: 'default', model: null, modelReasoningEffort: null })
        queue.close()

        await runPiPromptLoop({
            session: {} as never,
            piSession: {
                sendSessionEvent(event: Record<string, unknown>) {
                    events.push(event)
                },
                onThinkingChange(thinking: boolean) {
                    thinkingChanges.push(thinking)
                },
            } as never,
            messageQueue: queue,
            rpcClient: {
                prompt: vi.fn(async () => {
                    throw new Error('quota exceeded')
                }),
            } as never,
            applyRuntimeState: vi.fn(async () => {}),
            restoreSelectedRuntimeState: vi.fn(async () => {}),
            getAbortRequested: () => false,
            resetAbortRequested: vi.fn(),
        })

        expect(events).toEqual([
            { type: 'ready' },
            { type: 'assistant-error', detail: 'Pi turn failed: quota exceeded' },
            { type: 'ready' },
        ])
        expect(thinkingChanges).toEqual([true, false])
    })
})
