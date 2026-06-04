import { TerminalOpenPayloadSchema } from '@viby/protocol'
import type { ProviderAdapterInput } from '@viby/protocol/providerAdapterProtocol'
import { z } from 'zod'
import type { DirectRuntimeRegistry } from '../../runtime/directRuntimeRegistry'
import type { SocketWithData } from '../socketTypes'
import type { TerminalRegistry, TerminalRegistryEntry } from '../terminalRegistry'

const terminalCreateSchema = TerminalOpenPayloadSchema

const terminalWriteSchema = z.object({
    terminalId: z.string().min(1),
    data: z.string(),
})

const terminalResizeSchema = z.object({
    terminalId: z.string().min(1),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
})

const terminalCloseSchema = z.object({
    terminalId: z.string().min(1),
})

type TerminalInputEvent = Extract<ProviderAdapterInput, { type: 'runtime.terminal-input' }>['event']

export type TerminalHandlersDeps = {
    getSession: (sessionId: string) => { active: boolean } | null
    terminalRegistry: TerminalRegistry
    directRuntimeRegistry?: DirectRuntimeRegistry
    maxTerminalsPerSocket: number
    maxTerminalsPerSession: number
}

export function registerTerminalHandlers(socket: SocketWithData, deps: TerminalHandlersDeps): void {
    const { getSession, terminalRegistry, directRuntimeRegistry, maxTerminalsPerSocket, maxTerminalsPerSession } = deps

    const emitTerminalError = (terminalId: string, message: string) => {
        socket.emit('terminal:error', { terminalId, message })
    }

    const resolveEntryForSocket = (terminalId: string): TerminalRegistryEntry | null => {
        const entry = terminalRegistry.get(terminalId)
        if (!entry || entry.socketId !== socket.id) {
            return null
        }
        return entry
    }

    const sendTerminalInput = (entry: TerminalRegistryEntry, event: TerminalInputEvent, reportError: boolean): void => {
        const directTarget = directRuntimeRegistry?.getSessionTarget(entry.sessionId)
        if (directTarget?.id === entry.runtimeTargetId) {
            directTarget.send({ type: 'runtime.terminal-input', event: event as never })
            return
        }
        terminalRegistry.remove(entry.terminalId)
        if (reportError) emitTerminalError(entry.terminalId, 'Runtime disconnected.')
    }

    const emitCloseToCli = (entry: TerminalRegistryEntry): void => {
        sendTerminalInput(entry, { type: 'close', sessionId: entry.sessionId, terminalId: entry.terminalId }, false)
    }

    const pickRuntimeTargetId = (sessionId: string): string | null => {
        return directRuntimeRegistry?.getSessionTarget(sessionId)?.id ?? null
    }

    const unsubscribeDirectTerminal = directRuntimeRegistry?.subscribeTerminal((event) => {
        const entry = terminalRegistry.get(event.terminalId)
        if (!entry || entry.socketId !== socket.id || entry.runtimeTargetId !== event.targetId) return
        socket.emit(`terminal:${event.type}`, event)
    })

    socket.on('terminal:create', (data: unknown) => {
        const parsed = terminalCreateSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const { sessionId, terminalId, cols, rows } = parsed.data
        const session = getSession(sessionId)
        if (!session || !session.active) {
            emitTerminalError(terminalId, 'Session is inactive or unavailable.')
            return
        }

        const existingEntry = terminalRegistry.get(terminalId)
        const isReconnect = existingEntry?.sessionId === sessionId

        if (!isReconnect && terminalRegistry.countForSocket(socket.id) >= maxTerminalsPerSocket) {
            emitTerminalError(terminalId, `Too many terminals open (max ${maxTerminalsPerSocket}).`)
            return
        }

        if (!isReconnect && terminalRegistry.countForSession(sessionId) >= maxTerminalsPerSession) {
            emitTerminalError(terminalId, `Too many terminals open for this session (max ${maxTerminalsPerSession}).`)
            return
        }

        const runtimeTargetId = pickRuntimeTargetId(sessionId)
        if (!runtimeTargetId) {
            emitTerminalError(terminalId, 'Runtime is not connected for this session.')
            return
        }

        const entry = terminalRegistry.register(terminalId, sessionId, socket.id, runtimeTargetId)
        if (!entry) {
            emitTerminalError(terminalId, 'Terminal ID is already in use.')
            return
        }

        sendTerminalInput(entry, { type: 'open', sessionId, terminalId, cols, rows }, true)
        terminalRegistry.markActivity(terminalId)
    })

    socket.on('terminal:write', (data: unknown) => {
        const parsed = terminalWriteSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const { terminalId, data: payload } = parsed.data
        const entry = resolveEntryForSocket(terminalId)
        if (!entry) {
            return
        }

        sendTerminalInput(entry, { type: 'write', sessionId: entry.sessionId, terminalId, data: payload }, true)
        terminalRegistry.markActivity(terminalId)
    })

    socket.on('terminal:resize', (data: unknown) => {
        const parsed = terminalResizeSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const { terminalId, cols, rows } = parsed.data
        const entry = resolveEntryForSocket(terminalId)
        if (!entry) {
            return
        }

        sendTerminalInput(entry, { type: 'resize', sessionId: entry.sessionId, terminalId, cols, rows }, true)
        terminalRegistry.markActivity(terminalId)
    })

    socket.on('terminal:close', (data: unknown) => {
        const parsed = terminalCloseSchema.safeParse(data)
        if (!parsed.success) {
            return
        }

        const { terminalId } = parsed.data
        const entry = resolveEntryForSocket(terminalId)
        if (!entry) {
            return
        }

        terminalRegistry.remove(terminalId)
        emitCloseToCli(entry)
    })

    socket.on('disconnect', () => {
        unsubscribeDirectTerminal?.()
        const removed = terminalRegistry.removeBySocket(socket.id)
        for (const entry of removed) {
            emitCloseToCli(entry)
        }
    })
}
