import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { handleFakeSessionRpc } from './appLikeRouteBrowserRpcSupport'

export const DEFAULT_SESSION_RPC_METHODS = [
    'git-status',
    'git-diff-numstat',
    'git-diff-file',
    'readFile',
    'listDirectory',
] as const

const SESSION_ALIVE_INTERVAL_MS = 750
const TERMINAL_READY_OUTPUT = 'Viby smoke terminal ready\\r\\n$ '

type FakeCliSocketModule = typeof import('../../web/node_modules/socket.io-client/build/esm/index.js')
type SessionRpcMethod = (typeof DEFAULT_SESSION_RPC_METHODS)[number]

export type FakeCliRuntime = {
    disconnect: () => void
}

export async function createFakeCliRuntime(options: {
    cliApiToken: string
    hubUrl: string
    repoRoot: string
    routeSettleTimeoutMs: number
    sessionId: string
    sessionRpcMethods?: readonly SessionRpcMethod[]
    workspaceRoot: string
}): Promise<FakeCliRuntime> {
    const { io } = await loadFakeCliSocketModule(options.repoRoot)
    const socket = io(`${options.hubUrl}/cli`, {
        auth: {
            token: options.cliApiToken,
            sessionId: options.sessionId,
        },
        transports: ['websocket'],
        autoConnect: true,
    })

    await waitForFakeCliConnection(socket, options.routeSettleTimeoutMs)

    const emitAlive = (): void => {
        socket.emit('session-alive', {
            sid: options.sessionId,
            time: Date.now(),
            mode: 'local',
        })
    }

    socket.on('terminal:open', (payload: { sessionId: string; terminalId: string }) => {
        if (payload.sessionId !== options.sessionId) {
            return
        }

        socket.emit('terminal:ready', {
            sessionId: payload.sessionId,
            terminalId: payload.terminalId,
        })
        socket.emit('terminal:output', {
            sessionId: payload.sessionId,
            terminalId: payload.terminalId,
            data: TERMINAL_READY_OUTPUT,
        })
    })

    socket.on(
        'rpc-request',
        (
            payload: {
                method: string
                params: string
            },
            callback: (response: string) => void
        ) => {
            const params = payload.params ? JSON.parse(payload.params) : null
            const method = payload.method.replace(`${options.sessionId}:`, '')
            const response = handleFakeSessionRpc({
                method,
                params,
                workspaceRoot: options.workspaceRoot,
            })
            callback(JSON.stringify(response))
        }
    )

    emitAlive()
    for (const method of options.sessionRpcMethods ?? DEFAULT_SESSION_RPC_METHODS) {
        socket.emit('rpc-register', {
            method: getSessionRpcMethod(options.sessionId, method),
        })
    }
    const intervalId = globalThis.setInterval(emitAlive, SESSION_ALIVE_INTERVAL_MS)

    return {
        disconnect: (): void => {
            globalThis.clearInterval(intervalId)
            if (socket.connected) {
                socket.emit('session-end', {
                    sid: options.sessionId,
                    time: Date.now(),
                })
            }
            socket.disconnect()
        },
    }
}

async function loadFakeCliSocketModule(repoRoot: string): Promise<FakeCliSocketModule> {
    const socketModulePath = resolve(repoRoot, 'web/node_modules/socket.io-client/build/esm/index.js')
    return await import(pathToFileURL(socketModulePath).href)
}

async function waitForFakeCliConnection(
    socket: {
        off: (event: string, handler: (...args: unknown[]) => void) => void
        once: (event: string, handler: (...args: unknown[]) => void) => void
    },
    timeoutMs: number
): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
        const timeoutId = globalThis.setTimeout(() => {
            cleanup()
            rejectPromise(new Error('Timed out waiting for fake CLI socket connection.'))
        }, timeoutMs)

        const handleConnect = (): void => {
            cleanup()
            resolvePromise()
        }
        const handleError = (error: Error): void => {
            cleanup()
            rejectPromise(error)
        }
        const cleanup = (): void => {
            globalThis.clearTimeout(timeoutId)
            socket.off('connect', handleConnect)
            socket.off('connect_error', handleError)
        }

        socket.once('connect', handleConnect)
        socket.once('connect_error', handleError)
    })
}

function getSessionRpcMethod(sessionId: string, method: SessionRpcMethod): string {
    return `${sessionId}:${method}`
}
