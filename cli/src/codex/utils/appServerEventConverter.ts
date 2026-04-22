import { logger } from '@/ui/logger'
import { handleDirectNotification } from './appServerEventConverterSupport'
import { type ConvertedEvent, createAppServerEventState, resetAppServerEventState } from './appServerEventParser'
import { handleWrappedCodexEvent } from './appServerWrappedEventSupport'

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null
    }
    return value as Record<string, unknown>
}

export class AppServerEventConverter {
    private readonly state = createAppServerEventState()

    handleNotification(method: string, params: unknown): ConvertedEvent[] {
        const paramsRecord = asRecord(params) ?? {}

        if (method.startsWith('codex/event/')) {
            return handleWrappedCodexEvent(this.state, paramsRecord, (nextMethod, nextParams) =>
                this.handleNotification(nextMethod, nextParams)
            )
        }

        const handled = handleDirectNotification(this.state, method, paramsRecord)
        if (handled !== null) {
            return handled
        }

        logger.debug('[AppServerEventConverter] Unhandled notification', { method, params })
        return []
    }

    reset(): void {
        resetAppServerEventState(this.state)
    }
}
