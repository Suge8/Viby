import { describe, expect, it, vi } from 'vitest'
import { formatTerminalFailureMessage, settleTerminalTurn, surfaceTerminalFailure } from './turnTerminalSettlement'

describe('turnTerminalSettlement', () => {
    it('prefers concrete error detail and prefixes it once', () => {
        expect(
            formatTerminalFailureMessage({
                error: new Error('wallet balance required'),
                fallbackMessage: 'Claude prompt failed. Check logs for details.',
                detailPrefix: 'Claude prompt failed',
            })
        ).toBe('Claude prompt failed: wallet balance required')

        expect(
            formatTerminalFailureMessage({
                error: new Error('Claude prompt failed: wallet balance required'),
                fallbackMessage: 'Claude prompt failed. Check logs for details.',
                detailPrefix: 'Claude prompt failed',
            })
        ).toBe('Claude prompt failed: wallet balance required')
    })

    it('falls back when there is no usable detail', () => {
        expect(
            formatTerminalFailureMessage({
                error: new Error('   '),
                fallbackMessage: 'Prompt failed. Check logs for details.',
                detailPrefix: 'Prompt failed',
            })
        ).toBe('Prompt failed. Check logs for details.')
    })

    it('surfaces one terminal failure to transcript and status sinks', () => {
        const sendSessionMessage = vi.fn()
        const addStatusMessage = vi.fn()

        const message = surfaceTerminalFailure({
            error: new Error('provider unavailable'),
            fallbackMessage: 'Gemini prompt failed. Check logs for details.',
            detailPrefix: 'Gemini prompt failed',
            sendSessionMessage,
            addStatusMessage,
        })

        expect(message).toBe('Gemini prompt failed: provider unavailable')
        expect(sendSessionMessage).toHaveBeenCalledWith('Gemini prompt failed: provider unavailable')
        expect(addStatusMessage).toHaveBeenCalledWith('Gemini prompt failed: provider unavailable')
    })

    it('settles a terminal turn in the canonical order', async () => {
        const steps: string[] = []

        await settleTerminalTurn({
            beforeThinkingCleared: async () => {
                steps.push('before')
            },
            setThinking: (thinking) => {
                steps.push(`thinking:${thinking}`)
            },
            afterThinkingCleared: async () => {
                steps.push('after')
            },
            emitReady: async () => {
                steps.push('ready')
            },
        })

        expect(steps).toEqual(['before', 'thinking:false', 'after', 'ready'])
    })
})
