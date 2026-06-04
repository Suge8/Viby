import { emitReadyIfIdle, type ReadyEventOptions } from '@/agent/emitReadyIfIdle'
import { runDetachedTask } from '@/utils/runDetachedTask'

export type ReadyEventScheduler = {
    emitNow: () => Promise<boolean>
    emitDetached: () => void
    schedule: (delayMs: number) => void
    isScheduled: () => boolean
    cancel: () => void
    dispose: () => void
}

export function createReadyEventScheduler(options: ReadyEventOptions & { label: string }): ReadyEventScheduler {
    let timer: ReturnType<typeof setTimeout> | null = null

    const emitNow = async (): Promise<boolean> => await emitReadyIfIdle(options)

    const cancel = (): void => {
        if (!timer) {
            return
        }
        clearTimeout(timer)
        timer = null
    }

    const emitDetached = (): void => {
        runDetachedTask(emitNow, `${options.label}: ready emission failed`)
    }

    const schedule = (delayMs: number): void => {
        cancel()
        timer = setTimeout(() => {
            timer = null
            emitDetached()
        }, delayMs)
        timer.unref?.()
    }

    return {
        emitNow,
        emitDetached,
        schedule,
        isScheduled: () => timer !== null,
        cancel,
        dispose: cancel,
    }
}
