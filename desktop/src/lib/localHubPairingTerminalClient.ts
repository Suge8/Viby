import type { PairingPeerTerminalEventPayload } from '@viby/protocol/pairing'
import { io, type Socket } from 'socket.io-client'

type Authenticate = () => Promise<string>
type EmitTerminalEvent = (payload: PairingPeerTerminalEventPayload) => void

type TerminalEntry = {
    sessionId: string
    socket: Socket
}

export class LocalHubPairingTerminalClient {
    private readonly entries = new Map<string, TerminalEntry>()

    constructor(
        private readonly options: {
            authenticate: Authenticate
            baseUrl: string
        }
    ) {}

    async open(
        params: { sessionId: string; terminalId: string; cols: number; rows: number },
        emit: EmitTerminalEvent
    ): Promise<void> {
        this.close(params.terminalId)
        const token = await this.options.authenticate()
        const socket = io(`${this.options.baseUrl}/terminal`, { auth: { token }, autoConnect: false })
        this.entries.set(params.terminalId, { sessionId: params.sessionId, socket })

        await new Promise<void>((resolve, reject) => {
            const fail = (message: string): void => {
                this.entries.delete(params.terminalId)
                socket.removeAllListeners()
                socket.disconnect()
                reject(new Error(message))
            }
            socket.on('connect', () => {
                socket.emit('terminal:create', params)
            })
            socket.on('connect_error', (error: Error) => fail(error.message))
            socket.on('terminal:ready', (payload: { terminalId: string }) => {
                if (payload.terminalId !== params.terminalId) {
                    return
                }
                emit({ type: 'ready', sessionId: params.sessionId, terminalId: payload.terminalId })
                resolve()
            })
            socket.on('terminal:output', (payload: { terminalId: string; data: string }) => {
                if (payload.terminalId === params.terminalId) {
                    emit({ type: 'output', sessionId: params.sessionId, ...payload })
                }
            })
            socket.on(
                'terminal:exit',
                (payload: { terminalId: string; code: number | null; signal: string | null }) => {
                    if (payload.terminalId === params.terminalId) {
                        emit({ type: 'exit', sessionId: params.sessionId, ...payload })
                        this.close(params.terminalId)
                    }
                }
            )
            socket.on('terminal:error', (payload: { terminalId: string; message: string }) => {
                if (payload.terminalId === params.terminalId) {
                    emit({ type: 'error', sessionId: params.sessionId, ...payload })
                    fail(payload.message)
                }
            })
            socket.connect()
        })
    }

    write(sessionId: string, terminalId: string, data: string): void {
        this.entries.get(terminalId)?.socket.emit('terminal:write', { sessionId, terminalId, data })
    }

    resize(sessionId: string, terminalId: string, cols: number, rows: number): void {
        this.entries.get(terminalId)?.socket.emit('terminal:resize', { sessionId, terminalId, cols, rows })
    }

    close(terminalId: string): void {
        const entry = this.entries.get(terminalId)
        if (!entry) {
            return
        }
        entry.socket.emit('terminal:close', { sessionId: entry.sessionId, terminalId })
        entry.socket.removeAllListeners()
        entry.socket.disconnect()
        this.entries.delete(terminalId)
    }

    closeAll(): void {
        for (const terminalId of this.entries.keys()) {
            this.close(terminalId)
        }
    }
}
