import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiMachineClient } from './apiMachine'
import type { Machine, MachineMetadata } from './types'

class FakeSocket {
    private readonly listeners = new Map<string, Array<(...args: any[]) => void>>()

    on(event: string, handler: (...args: any[]) => void): this {
        const current = this.listeners.get(event) ?? []
        current.push(handler)
        this.listeners.set(event, current)
        return this
    }

    emit(event: string, ...args: any[]): void {
        const handlers = this.listeners.get(event) ?? []
        for (const handler of handlers) {
            handler(...args)
        }
    }

    emitWithAck = vi.fn(async (event: string, payload: Record<string, unknown>) => {
        if (event === 'machine-update-metadata') {
            return {
                result: 'success',
                version: 2,
                metadata: payload.metadata
            }
        }

        return {
            result: 'success',
            version: 1,
            runnerState: {
                status: 'running',
                pid: 123,
                httpPort: 456,
                startedAt: 789
            }
        }
    })

    close = vi.fn()
}

const { sockets, ioMock } = vi.hoisted(() => {
    const hoistedSockets: FakeSocket[] = []
    const hoistedIoMock = vi.fn(() => {
        const socket = new FakeSocket()
        hoistedSockets.push(socket)
        return socket
    })

    return {
        sockets: hoistedSockets,
        ioMock: hoistedIoMock
    }
})

vi.mock('socket.io-client', () => ({
    io: ioMock
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn()
    }
}))

vi.mock('../modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: vi.fn()
}))

vi.mock('./pathExistsHandler', () => ({
    handlePathExistsRequest: vi.fn()
}))

function createMachineMetadata(overrides: Partial<MachineMetadata> = {}): MachineMetadata {
    return {
        host: 'MacBook-Air.local',
        platform: 'darwin',
        vibyCliVersion: '0.1.0',
        capabilities: ['browse-directory'],
        homeDir: '/Users/sugeh',
        vibyHomeDir: '/Users/sugeh/.viby',
        vibyLibDir: '/Users/sugeh/Project/Viby/cli',
        ...overrides
    }
}

function createMachine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-test',
        seq: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: true,
        activeAt: Date.now(),
        metadata: null,
        metadataVersion: 0,
        runnerState: null,
        runnerStateVersion: 0,
        ...overrides
    }
}

beforeEach(() => {
    sockets.length = 0
    ioMock.mockClear()
})

describe('ApiMachineClient', () => {
    it('keeps runner alive across transient hub disconnects', () => {
        const client = new ApiMachineClient('token', createMachine())
        const requestShutdown = vi.fn()
        const spawnSession = vi.fn(async () => ({
            type: 'error' as const,
            errorMessage: 'unused'
        }))

        client.setRPCHandlers({
            spawnSession,
            stopSession: vi.fn(() => false),
            requestShutdown
        })

        client.connect()
        expect(ioMock).toHaveBeenCalledTimes(1)

        const socket = sockets[0]
        expect(socket).toBeDefined()
        socket.emit('disconnect')

        expect(requestShutdown).not.toHaveBeenCalled()

        client.shutdown()
        expect(socket.close).toHaveBeenCalledTimes(1)
    })

    it('refreshes stale machine metadata on connect before project browsing depends on it', async () => {
        const nextMetadata = createMachineMetadata()
        const machine = createMachine({
            metadata: createMachineMetadata({
                vibyCliVersion: '0.16.1',
                capabilities: undefined,
                vibyLibDir: '/Users/sugeh/Project/Viby/cli'
            }),
            metadataVersion: 1
        })
        const client = new ApiMachineClient('token', machine, {
            getMachineMetadata: () => nextMetadata
        })

        client.connect()
        const socket = sockets[0]
        expect(socket).toBeDefined()

        socket.emit('connect')

        await vi.waitFor(() => {
            expect(socket.emitWithAck).toHaveBeenCalledWith('machine-update-metadata', {
                machineId: 'machine-test',
                metadata: nextMetadata,
                expectedVersion: 1
            })
        })

        expect(machine.metadata).toEqual(nextMetadata)
        expect(machine.metadataVersion).toBe(2)
        expect(socket.emitWithAck).toHaveBeenCalledWith('machine-update-state', expect.objectContaining({
            machineId: 'machine-test',
            expectedVersion: 0
        }))
    })

    it('skips machine metadata sync on connect when local metadata already matches', async () => {
        const currentMetadata = createMachineMetadata()
        const machine = createMachine({
            metadata: currentMetadata,
            metadataVersion: 3
        })
        const client = new ApiMachineClient('token', machine, {
            getMachineMetadata: () => ({ ...currentMetadata })
        })

        client.connect()
        const socket = sockets[0]
        expect(socket).toBeDefined()

        socket.emit('connect')

        await vi.waitFor(() => {
            expect(socket.emitWithAck).toHaveBeenCalledTimes(1)
        })

        expect(socket.emitWithAck).toHaveBeenCalledWith('machine-update-state', expect.objectContaining({
            machineId: 'machine-test',
            expectedVersion: 0
        }))
    })
})
