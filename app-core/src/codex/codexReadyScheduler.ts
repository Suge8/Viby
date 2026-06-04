import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { createReadyEventScheduler, type ReadyEventScheduler } from '@/agent/readyEventScheduler'
import type { CodexSession } from './session'

export function createCodexReadyScheduler(
    session: CodexSession,
    shouldExit: () => boolean,
    hasPending: () => boolean
): ReadyEventScheduler {
    return createReadyEventScheduler({
        label: '[codex-remote]',
        hasPending,
        queueSize: () => session.queue.size(),
        shouldExit,
        flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
        sendReady: () => session.sendSessionEvent({ type: 'ready' }),
    })
}
