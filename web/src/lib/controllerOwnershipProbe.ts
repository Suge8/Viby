import { debugWebRuntime, reportWebRuntimeWarning } from '@/lib/runtimeDiagnostics'

type ControllerTraceEventType = 'enter' | 'leave' | 'conflict'

type ControllerTraceEvent = {
    type: ControllerTraceEventType
    at: number
    surface: string
    controller: string
    activeControllers: string[]
}

type ControllerProbeWindow = Window & {
    __VIBY_CONTROLLER_TRACE__?: ControllerTraceEvent[]
    __VIBY_ENABLE_CONTROLLER_TRACE_LOG__?: boolean
    __VIBY_CONTROLLER_ACTIVE__?: Record<string, Record<string, number>>
}

const MAX_TRACE_EVENTS = 400

function getProbeWindow(): ControllerProbeWindow | null {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return null
    }
    return window as ControllerProbeWindow
}

function listActiveControllers(activeByController: Record<string, number>): string[] {
    return Object.entries(activeByController)
        .filter(([, count]) => count > 0)
        .map(([controller]) => controller)
        .sort()
}

function appendTrace(event: ControllerTraceEvent): void {
    const probeWindow = getProbeWindow()
    if (!probeWindow) {
        return
    }

    probeWindow.__VIBY_CONTROLLER_TRACE__ = [...(probeWindow.__VIBY_CONTROLLER_TRACE__ ?? []), event].slice(
        -MAX_TRACE_EVENTS
    )
    if (probeWindow.__VIBY_ENABLE_CONTROLLER_TRACE_LOG__ === true) {
        debugWebRuntime('controller trace', event)
    }
}

export function enterControllerSurface(surface: string, controller: string): () => void {
    const probeWindow = getProbeWindow()
    if (!probeWindow) {
        return () => {}
    }

    const activeBySurface = (probeWindow.__VIBY_CONTROLLER_ACTIVE__ ??= {})
    const activeByController = (activeBySurface[surface] ??= {})
    activeByController[controller] = (activeByController[controller] ?? 0) + 1
    const activeControllers = listActiveControllers(activeByController)

    appendTrace({
        type: 'enter',
        at: Date.now(),
        surface,
        controller,
        activeControllers,
    })

    if (activeControllers.length > 1) {
        const conflictEvent = {
            type: 'conflict' as const,
            at: Date.now(),
            surface,
            controller,
            activeControllers,
        }
        appendTrace(conflictEvent)
        reportWebRuntimeWarning('controller contention detected', conflictEvent)
    }

    let closed = false
    return () => {
        if (closed) {
            return
        }
        closed = true

        const nextCount = (activeByController[controller] ?? 0) - 1
        if (nextCount <= 0) {
            delete activeByController[controller]
        } else {
            activeByController[controller] = nextCount
        }

        const nextActiveControllers = listActiveControllers(activeByController)
        appendTrace({
            type: 'leave',
            at: Date.now(),
            surface,
            controller,
            activeControllers: nextActiveControllers,
        })

        if (nextActiveControllers.length === 0) {
            delete activeBySurface[surface]
        }
    }
}
