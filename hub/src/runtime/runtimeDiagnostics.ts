type RuntimeDetail = unknown

function emitRuntimeConsole(level: 'error' | 'info' | 'warn', message: string, detail?: RuntimeDetail): void {
    const prefix = '[HubRuntime]'
    if (detail === undefined) {
        console[level](`${prefix} ${message}`)
        return
    }

    console[level](`${prefix} ${message}`, detail)
}

export function reportHubRuntimeError(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('error', message, detail)
}

export function reportHubRuntimeInfo(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('info', message, detail)
}

export function reportHubRuntimeWarning(message: string, detail?: RuntimeDetail): void {
    emitRuntimeConsole('warn', message, detail)
}
