type RuntimeDetail = unknown

function emitRuntimeConsole(
    level: 'debug' | 'error' | 'info' | 'warn',
    message: string,
    detail?: RuntimeDetail,
    options?: { devOnly?: boolean }
): void {
    if (options?.devOnly && !import.meta.env.DEV) {
        return
    }

    const prefix = '[WebRuntime]'
    if (detail === undefined) {
        console[level](`${prefix} ${message}`)
        return
    }

    console[level](`${prefix} ${message}`, detail)
}

export function debugWebRuntime(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('debug', message, detail, { devOnly: true })
}

export function reportWebRuntimeError(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('error', message, detail)
}

export function reportWebRuntimeInfo(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('info', message, detail, { devOnly: true })
}

export function reportWebRuntimeWarning(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('warn', message, detail)
}
