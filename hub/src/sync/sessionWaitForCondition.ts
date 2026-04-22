import type { Session } from '@viby/protocol/types'
import type { SyncEventListener } from './eventPublisher'

export type WaitForSessionConditionOptions<T> = {
    timeoutMs: number
    resolveValue: (session: Session | undefined) => T | null
    onTimeout: () => T
    isRelevantEvent?: (event: Parameters<SyncEventListener>[0]) => boolean
}

export async function waitForSessionCondition<T>(options: {
    sessionId: string
    loadSession: (sessionId: string) => Session | null
    subscribe: (listener: SyncEventListener) => () => void
    condition: WaitForSessionConditionOptions<T>
}): Promise<T> {
    function resolveCurrentValue(): T | null {
        const session = options.loadSession(options.sessionId) ?? undefined
        return options.condition.resolveValue(session)
    }

    const immediateValue = resolveCurrentValue()
    if (immediateValue !== null) {
        return immediateValue
    }

    return await new Promise<T>((resolve, reject) => {
        let settled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        function cleanup(unsubscribe: () => void): void {
            if (timeoutId) {
                clearTimeout(timeoutId)
                timeoutId = null
            }
            unsubscribe()
        }

        function settle(unsubscribe: () => void, finalize: () => T): void {
            if (settled) {
                return
            }
            settled = true
            cleanup(unsubscribe)
            try {
                resolve(finalize())
            } catch (error) {
                reject(error)
            }
        }

        const unsubscribe = options.subscribe((event) => {
            if (!('sessionId' in event) || event.sessionId !== options.sessionId) {
                return
            }
            if (options.condition.isRelevantEvent && !options.condition.isRelevantEvent(event)) {
                return
            }

            const nextValue = resolveCurrentValue()
            if (nextValue !== null) {
                settle(unsubscribe, () => nextValue)
            }
        })

        timeoutId = setTimeout(() => {
            settle(unsubscribe, options.condition.onTimeout)
        }, options.condition.timeoutMs)
        timeoutId.unref?.()

        const nextValue = resolveCurrentValue()
        if (nextValue !== null) {
            settle(unsubscribe, () => nextValue)
        }
    })
}
