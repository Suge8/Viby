import { describe, expect, it } from 'bun:test'
import { ensureDockerRuntime } from './colimaDockerRuntime'

describe('colima Docker runtime lease', () => {
    it('uses an already available Docker daemon without owning Colima lifecycle', () => {
        const calls: string[] = []
        const lease = ensureDockerRuntime({
            runner: (command, args) => {
                calls.push([command, ...args].join(' '))
                return { status: command === 'docker' ? 0 : 1, stdout: '', stderr: '' }
            },
            write: () => {},
        })

        expect(lease?.startedColima).toBe(false)
        lease?.dispose()
        expect(calls).toEqual(['docker info'])
    })

    it('starts Colima when Docker is unavailable and stops only the instance it started', () => {
        const calls: string[] = []
        let dockerReady = false
        let now = 0
        const lease = ensureDockerRuntime({
            now: () => now,
            runner: (command, args) => {
                calls.push([command, ...args].join(' '))
                if (command === 'docker') return { status: dockerReady ? 0 : 1, stdout: '', stderr: '' }
                if (command === 'colima' && args[0] === 'version') return { status: 0, stdout: '', stderr: '' }
                if (command === 'colima' && args[0] === 'start') {
                    dockerReady = true
                    return { status: 0, stdout: '', stderr: '' }
                }
                return { status: 0, stdout: '', stderr: '' }
            },
            sleep: (ms) => {
                now += ms
            },
            write: () => {},
        })

        expect(lease?.startedColima).toBe(true)
        lease?.dispose()
        expect(calls).toEqual(['docker info', 'colima version', 'colima start', 'docker info', 'colima stop'])
    })

    it('respects explicit opt-out so CI can fail or skip without mutating Colima state', () => {
        const calls: string[] = []
        const lease = ensureDockerRuntime({
            env: { VIBY_PAIRING_NETEM_AUTO_COLIMA: '0' },
            runner: (command, args) => {
                calls.push([command, ...args].join(' '))
                return { status: 1, stdout: '', stderr: '' }
            },
            write: () => {},
        })

        expect(lease).toBeNull()
        expect(calls).toEqual(['docker info'])
    })

    it('stops Colima if Docker never becomes ready after a harness-owned start', () => {
        const calls: string[] = []
        let now = 0
        expect(() =>
            ensureDockerRuntime({
                env: { VIBY_PAIRING_NETEM_DOCKER_WAIT_MS: '2000' },
                now: () => now,
                runner: (command, args) => {
                    calls.push([command, ...args].join(' '))
                    if (command === 'colima' && args[0] === 'version') return { status: 0, stdout: '', stderr: '' }
                    if (command === 'colima' && args[0] === 'start') return { status: 0, stdout: '', stderr: '' }
                    return { status: command === 'colima' ? 0 : 1, stdout: '', stderr: '' }
                },
                sleep: (ms) => {
                    now += ms
                },
                write: () => {},
            })
        ).toThrow('Docker daemon did not become ready')
        expect(calls.at(-1)).toBe('colima stop')
    })
})
