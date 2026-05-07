import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { renderWithI18n } from '@/test/i18n'
import type { DecryptedMessage } from '@/types/api'
import { QueuedMessagesBar } from './QueuedMessagesBar'

function createQueuedUserMessage(localId: string, text: string): DecryptedMessage {
    return {
        id: localId,
        seq: null,
        localId,
        content: {
            role: 'user',
            content: {
                type: 'text',
                text,
            },
        },
        createdAt: 1_000,
        invokedAt: null,
        status: 'queued',
    }
}

function createDeferred<T>(): {
    promise: Promise<T>
    resolve: (value: T) => void
} {
    let resolvePromise!: (value: T) => void
    const promise = new Promise<T>((resolve) => {
        resolvePromise = resolve
    })
    return {
        promise,
        resolve: resolvePromise,
    }
}

describe('QueuedMessagesBar', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('deduplicates queued messages across durable and pending windows', async () => {
        const api = { cancelQueuedMessages: vi.fn() } as unknown as ApiClient

        await renderWithI18n(
            <QueuedMessagesBar
                api={api}
                sessionId="session-1"
                messages={[createQueuedUserMessage('local-1', 'first queued')]}
                pending={[
                    createQueuedUserMessage('local-1', 'duplicate queued'),
                    createQueuedUserMessage('local-2', 'second queued'),
                ]}
            />
        )

        expect(screen.getByText('Queued')).toBeInTheDocument()
        expect(screen.getByText('2 queued')).toBeInTheDocument()
        expect(screen.getByText('first queued')).toBeInTheDocument()
        expect(screen.getByText('second queued')).toBeInTheDocument()
        expect(screen.queryByText('duplicate queued')).not.toBeInTheDocument()
    })

    it('sends only one cancel request per queued local id while cancellation is pending', async () => {
        const deferred = createDeferred<string[]>()
        const api = {
            cancelQueuedMessages: vi.fn(() => deferred.promise),
        } as unknown as ApiClient

        await renderWithI18n(
            <QueuedMessagesBar
                api={api}
                sessionId="session-1"
                messages={[createQueuedUserMessage('local-1', 'queued once')]}
                pending={[]}
            />
        )

        const cancelButton = screen.getByRole('button', { name: 'Cancel queued message' })
        fireEvent.click(cancelButton)
        fireEvent.click(cancelButton)

        expect(api.cancelQueuedMessages).toHaveBeenCalledTimes(1)
        expect(api.cancelQueuedMessages).toHaveBeenCalledWith('session-1', ['local-1'])

        await act(async () => {
            deferred.resolve(['local-1'])
            await deferred.promise
        })

        await waitFor(() => {
            expect(cancelButton).not.toBeDisabled()
        })
    })
})
