export type DesktopParentPipeShutdown = {
    dispose(): void
}

type ParentPipeEvent = 'close' | 'end'

type ParentPipe = {
    once(event: ParentPipeEvent, listener: () => void): ParentPipe
    removeListener(event: ParentPipeEvent, listener: () => void): ParentPipe
    resume(): ParentPipe
}

type DesktopParentPipeShutdownOptions = {
    onOrphaned: () => void
    parentPipe?: ParentPipe
}

const DESKTOP_LAUNCH_SOURCE = 'desktop'
const DESKTOP_PARENT_PIPE_ENV = 'VIBY_DESKTOP_PARENT_PIPE'

function shouldWatchDesktopParentPipe(): boolean {
    return process.env.VIBY_LAUNCH_SOURCE === DESKTOP_LAUNCH_SOURCE && process.env[DESKTOP_PARENT_PIPE_ENV] === '1'
}

export function startDesktopParentPipeShutdown(
    options: DesktopParentPipeShutdownOptions
): DesktopParentPipeShutdown | null {
    if (!shouldWatchDesktopParentPipe()) return null

    const parentPipe = options.parentPipe ?? (process.stdin as ParentPipe)
    let disposed = false

    const handleClosed = () => {
        if (disposed) return
        disposed = true
        parentPipe.removeListener('end', handleClosed)
        parentPipe.removeListener('close', handleClosed)
        options.onOrphaned()
    }

    parentPipe.once('end', handleClosed)
    parentPipe.once('close', handleClosed)
    parentPipe.resume()

    return {
        dispose: () => {
            disposed = true
            parentPipe.removeListener('end', handleClosed)
            parentPipe.removeListener('close', handleClosed)
        },
    }
}
