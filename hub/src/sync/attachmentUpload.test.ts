import { describe, expect, it } from 'bun:test'
import type { Server } from 'socket.io'
import { Store } from '../store'
import { RpcRegistry } from '../socket/rpcRegistry'
import { SyncEngine } from './syncEngine'

function createIoStub(): Server {
    return {
        of() {
            return {
                sockets: new Map(),
                to() {
                    return {
                        emit() {
                        }
                    }
                }
            }
        }
    } as unknown as Server
}

function createEngine(): { engine: SyncEngine; store: Store } {
    const store = new Store(':memory:')
    const engine = new SyncEngine(
        store,
        createIoStub(),
        new RpcRegistry(),
        { broadcast() {} } as never
    )

    return { engine, store }
}

function seedSession(engine: SyncEngine, store: Store) {
    const session = engine.getOrCreateSession({
        tag: 'session-attachment-upload',
        metadata: {
            path: '/tmp/project',
            host: 'localhost',
            machineId: 'machine-1',
            flavor: 'codex',
            codexSessionId: 'codex-thread-1'
        },
        model: 'gpt-5.4',
        agentState: null
    } as Parameters<SyncEngine['getOrCreateSession']>[0])

    store.messages.addMessage(session.id, {
        role: 'assistant',
        content: {
            type: 'text',
            text: 'existing reply'
        }
    })

    return session
}

describe('SyncEngine attachment uploads', () => {
    it('resumes inactive sessions before uploading attachment files', async () => {
        const { engine, store } = createEngine()
        try {
            const session = seedSession(engine, store)
            engine.handleSessionEnd({ sid: session.id, time: Date.now() })

            const steps: string[] = []
            ;(engine as any).resumeSession = async (sessionId: string) => {
                steps.push(`resume:${sessionId}`)
                engine.handleSessionAlive({ sid: sessionId, time: Date.now() })
                return { type: 'success', sessionId }
            }
            ;(engine as any).rpcGateway.uploadFile = async (
                sessionId: string,
                filename: string,
                _content: string,
                mimeType: string
            ) => {
                steps.push(`upload:${sessionId}:${filename}:${mimeType}`)
                return { success: true, path: '/tmp/uploaded.png' }
            }

            const result = await engine.uploadFile(session.id, 'photo.png', 'YWJj', 'image/png')

            expect(result).toEqual({
                success: true,
                path: '/tmp/uploaded.png'
            })
            expect(steps).toEqual([
                `resume:${session.id}`,
                `upload:${session.id}:photo.png:image/png`
            ])
        } finally {
            engine.stop()
        }
    })

    it('resumes inactive sessions before deleting attachment files', async () => {
        const { engine, store } = createEngine()
        try {
            const session = seedSession(engine, store)
            engine.handleSessionEnd({ sid: session.id, time: Date.now() })

            const steps: string[] = []
            ;(engine as any).resumeSession = async (sessionId: string) => {
                steps.push(`resume:${sessionId}`)
                engine.handleSessionAlive({ sid: sessionId, time: Date.now() })
                return { type: 'success', sessionId }
            }
            ;(engine as any).rpcGateway.deleteUploadFile = async (sessionId: string, path: string) => {
                steps.push(`delete:${sessionId}:${path}`)
                return { success: true }
            }

            const result = await engine.deleteUploadFile(session.id, '/tmp/uploaded.png')

            expect(result).toEqual({ success: true })
            expect(steps).toEqual([
                `resume:${session.id}`,
                `delete:${session.id}:/tmp/uploaded.png`
            ])
        } finally {
            engine.stop()
        }
    })
})
