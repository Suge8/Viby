import { afterEach, describe, expect, it } from 'bun:test'
import { startDesktopParentPipeShutdown } from './desktopParentPipeShutdown'

const originalLaunchSource = process.env.VIBY_LAUNCH_SOURCE
const originalParentPipe = process.env.VIBY_DESKTOP_PARENT_PIPE

type ParentPipeEvent = 'close' | 'end'
type ParentPipeListener = () => void

class FakeParentPipe {
    readonly listeners = new Map<ParentPipeEvent, ParentPipeListener>()
    resumed = false

    once(event: ParentPipeEvent, listener: ParentPipeListener): this {
        this.listeners.set(event, listener)
        return this
    }

    removeListener(event: ParentPipeEvent, listener: ParentPipeListener): this {
        if (this.listeners.get(event) === listener) this.listeners.delete(event)
        return this
    }

    resume(): this {
        this.resumed = true
        return this
    }

    emit(event: ParentPipeEvent): void {
        this.listeners.get(event)?.()
    }
}

afterEach(() => {
    process.env.VIBY_LAUNCH_SOURCE = originalLaunchSource
    process.env.VIBY_DESKTOP_PARENT_PIPE = originalParentPipe
})

function enableDesktopPipeWatch(): void {
    process.env.VIBY_LAUNCH_SOURCE = 'desktop'
    process.env.VIBY_DESKTOP_PARENT_PIPE = '1'
}

describe('desktopParentPipeShutdown', () => {
    it('stays inactive outside desktop-owned pipe launches', () => {
        delete process.env.VIBY_LAUNCH_SOURCE
        delete process.env.VIBY_DESKTOP_PARENT_PIPE

        const pipeShutdown = startDesktopParentPipeShutdown({ onOrphaned: () => {} })

        expect(pipeShutdown).toBeNull()
    })

    it('shuts down when the desktop parent pipe closes', () => {
        enableDesktopPipeWatch()
        const parentPipe = new FakeParentPipe()
        let orphaned = false

        startDesktopParentPipeShutdown({
            onOrphaned: () => {
                orphaned = true
            },
            parentPipe,
        })

        parentPipe.emit('close')

        expect(parentPipe.resumed).toBe(true)
        expect(orphaned).toBe(true)
        expect(parentPipe.listeners.size).toBe(0)
    })

    it('removes listeners on dispose without shutting down', () => {
        enableDesktopPipeWatch()
        const parentPipe = new FakeParentPipe()
        let orphaned = false
        const pipeShutdown = startDesktopParentPipeShutdown({
            onOrphaned: () => {
                orphaned = true
            },
            parentPipe,
        })

        pipeShutdown?.dispose()
        parentPipe.emit('end')

        expect(orphaned).toBe(false)
        expect(parentPipe.listeners.size).toBe(0)
    })
})
