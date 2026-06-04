type TerminalFailureMessageOptions = {
    error: unknown
    fallbackMessage: string
    detailPrefix?: string
}

type SurfaceTerminalFailureOptions = TerminalFailureMessageOptions & {
    sendSessionMessage: (message: string) => void
    addStatusMessage?: (message: string) => void
}

type SettleTerminalTurnOptions = {
    beforeThinkingCleared?: () => Promise<void> | void
    setThinking: (thinking: boolean) => void
    afterThinkingCleared?: () => Promise<void> | void
    emitReady: () => Promise<unknown> | unknown
}

function getErrorDetail(error: unknown): string | null {
    if (error instanceof Error) {
        const message = error.message.trim()
        return message.length > 0 ? message : null
    }

    if (typeof error === 'string') {
        const message = error.trim()
        return message.length > 0 ? message : null
    }

    return null
}

export function formatTerminalFailureMessage(options: TerminalFailureMessageOptions): string {
    const detail = getErrorDetail(options.error)
    if (!detail) {
        return options.fallbackMessage
    }
    if (!options.detailPrefix) {
        return detail
    }
    if (detail.startsWith(`${options.detailPrefix}:`)) {
        return detail
    }
    return `${options.detailPrefix}: ${detail}`
}

export function surfaceTerminalFailure(options: SurfaceTerminalFailureOptions): string {
    const message = formatTerminalFailureMessage(options)
    options.sendSessionMessage(message)
    options.addStatusMessage?.(message)
    return message
}

export async function settleTerminalTurn(options: SettleTerminalTurnOptions): Promise<void> {
    await options.beforeThinkingCleared?.()
    options.setThinking(false)
    await options.afterThinkingCleared?.()
    await options.emitReady()
}
