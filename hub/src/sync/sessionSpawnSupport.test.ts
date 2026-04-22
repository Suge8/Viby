import { describe, expect, it } from 'bun:test'
import { getSessionLifecycleState } from '@viby/protocol'
import { createEngineSession, createIoStub, RpcRegistry, Store, SyncEngine } from './sessionModel.support.test'

describe('session spawn support', () => {
    it('waits for the authoritative active signal before failing a fresh inactive send start', async () => {
        const store = new Store(':memory:')
        const engine = new SyncEngine(store, createIoStub(), new RpcRegistry(), { broadcast() {} } as never)

        try {
            const session = createEngineSession(engine, {
                tag: 'session-send-delayed-active',
                metadata: {
                    path: '/tmp/project',
                    host: 'localhost',
                    machineId: 'machine-1',
                    driver: 'codex',
                },
                model: 'gpt-5.4',
            })

            await (engine as any).sessionCache.setSessionLifecycleState(session.id, 'closed')
            engine.getOrCreateMachine(
                'machine-1',
                { host: 'localhost', platform: 'linux', vibyCliVersion: '0.1.0' },
                null
            )
            engine.handleMachineAlive({ machineId: 'machine-1', time: Date.now() })

            ;(engine as any).rpcGateway.spawnSession = async () => {
                setTimeout(() => {
                    engine.handleSessionAlive({
                        sid: session.id,
                        time: Date.now(),
                    })
                }, 0)

                return {
                    type: 'success',
                    sessionId: session.id,
                }
            }
            ;(engine as any).resumeSession = async () => {
                throw new Error('resumeSession should not be used for empty inactive sessions')
            }

            const result = await engine.sendMessage(session.id, {
                text: 'hello after delayed active',
            })

            expect(result.active).toBe(true)
            expect(getSessionLifecycleState(result)).toBe('running')
            expect(store.messages.getMessages(session.id, 10)).toContainEqual(
                expect.objectContaining({
                    content: expect.objectContaining({
                        role: 'user',
                        content: expect.objectContaining({
                            type: 'text',
                            text: 'hello after delayed active',
                        }),
                    }),
                })
            )
        } finally {
            engine.stop()
        }
    })
})
