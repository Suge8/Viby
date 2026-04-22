import { describe, expect, it, vi } from 'vitest'
import { MessageQueue2 } from '@/utils/MessageQueue2'
import { runPiPromptLoop, subscribeToPiSessionEvents } from './runPiSupport'

describe('subscribeToPiSessionEvents', () => {
    it('attaches the Pi assistant turn id to the durable assistant message meta', () => {
        let handler: ((event: unknown) => void) | null = null
        const sendOutputMessage = vi.fn()
        const sendStreamUpdate = vi.fn()
        const onThinkingChange = vi.fn()

        const unsubscribe = subscribeToPiSessionEvents({
            piSession: {
                sendOutputMessage,
                sendStreamUpdate,
                onThinkingChange,
            } as never,
            sdkSession: {
                subscribe(next: (event: unknown) => void) {
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
                cost: {
                    input: 0,
                    output: 0,
                    cacheRead: 0,
                    cacheWrite: 0,
                    total: 0,
                },
            },
            stopReason: 'stop',
            timestamp: 1_000,
            content: [{ type: 'text', text: 'done' }],
        }

        handler?.({ type: 'message_start', message: assistantMessage })
        handler?.({
            type: 'message_update',
            assistantMessageEvent: {
                type: 'text_delta',
                delta: 'done',
            },
        })
        handler?.({ type: 'message_end', message: assistantMessage })

        expect(sendStreamUpdate).toHaveBeenCalledWith({
            kind: 'append',
            assistantTurnId: 'pi-assistant-1000',
            delta: 'done',
        })
        expect(sendOutputMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'assistant',
                uuid: 'pi-assistant-1000',
            }),
            {
                assistantTurnId: 'pi-assistant-1000',
            }
        )

        unsubscribe()
    })

    it('surfaces the concrete Pi failure and still emits ready after the turn settles', async () => {
        const events: Array<Record<string, unknown>> = []
        const queue = new MessageQueue2<{ permissionMode: 'default' }>((mode) => JSON.stringify(mode))
        queue.push('hello', { permissionMode: 'default' })
        queue.close()

        await runPiPromptLoop({
            session: {} as never,
            piSession: {
                sendSessionEvent(event: Record<string, unknown>) {
                    events.push(event)
                },
                onThinkingChange: vi.fn(),
            } as never,
            messageQueue: queue,
            sdkSession: {
                prompt: vi.fn(async () => {
                    throw new Error('quota exceeded')
                }),
            } as never,
            permissionHandler: {
                hasPendingRequests() {
                    return false
                },
                cancelAll: vi.fn(async () => {}),
            } as never,
            applyRuntimeState: vi.fn(),
            restoreSelectedRuntimeState: vi.fn(),
            getAbortRequested: () => false,
            resetAbortRequested: vi.fn(),
        })

        expect(events).toEqual([
            { type: 'ready' },
            { type: 'message', message: 'Pi prompt failed: quota exceeded' },
            { type: 'ready' },
        ])
    })
})
