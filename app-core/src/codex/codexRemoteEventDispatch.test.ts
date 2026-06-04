import { PROPOSED_PLAN_CLOSE_TAG, PROPOSED_PLAN_OPEN_TAG } from '@viby/protocol'
import { describe, expect, it, vi } from 'vitest'
import { dispatchBufferEvent, dispatchCodexStructuredEvent } from './codexRemoteEventDispatch'

function createDispatchContext() {
    return {
        session: {
            sendCodexMessage: vi.fn(),
        },
        messageBuffer: {
            addMessage: vi.fn(),
        },
        reasoningProcessor: {
            handleSectionBreak: vi.fn(),
            processDelta: vi.fn(),
            complete: vi.fn(),
        },
        diffProcessor: {
            processDiff: vi.fn(),
        },
        appendAssistantStream: vi.fn(),
        acknowledgeAssistantTurn: vi.fn(),
    }
}

describe('codexRemoteEventDispatch', () => {
    it('adds a compact status message for plan updates', () => {
        const context = createDispatchContext()

        dispatchBufferEvent(context as never, 'plan_update', {})

        expect(context.messageBuffer.addMessage).toHaveBeenCalledWith('Plan updated', 'status')
    })

    it('forwards plan updates as structured plan messages', () => {
        const context = createDispatchContext()

        dispatchCodexStructuredEvent(context as never, 'plan_update', {
            turn_id: 'turn-1',
            explanation: 'Keep the user aligned',
            entries: [
                { content: 'Trace the event source', status: 'completed' },
                { content: 'Render the plan card', status: 'in_progress' },
            ],
        })

        expect(context.session.sendCodexMessage).toHaveBeenCalledWith({
            type: 'plan',
            id: 'plan:turn-1',
            explanation: 'Keep the user aligned',
            entries: [
                { content: 'Trace the event source', status: 'completed', priority: 'medium' },
                { content: 'Render the plan card', status: 'in_progress', priority: 'medium' },
            ],
        })
    })

    it('forwards plan proposals as wrapped assistant messages', () => {
        const context = createDispatchContext()

        dispatchCodexStructuredEvent(context as never, 'plan_proposal', {
            item_id: 'plan-item-1',
            message: '# Plan\n\n- Step 1',
        })

        expect(context.session.sendCodexMessage).toHaveBeenCalledWith({
            type: 'message',
            message: `${PROPOSED_PLAN_OPEN_TAG}\n# Plan\n\n- Step 1\n${PROPOSED_PLAN_CLOSE_TAG}`,
            itemId: 'plan-item-1',
            id: expect.any(String),
        })
    })
})
