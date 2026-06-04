import { existsSync, watch } from 'node:fs'
import { basename, dirname } from 'node:path'

export async function awaitFileExist(file: string, timeout: number = 10000): Promise<boolean> {
    if (existsSync(file)) return true

    const directory = dirname(file)
    const targetName = basename(file)
    return await new Promise<boolean>((resolve) => {
        let watcher: ReturnType<typeof watch> | null = null
        let settled = false
        const finish = (value: boolean): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            watcher?.close()
            resolve(value)
        }
        const timer = setTimeout(() => finish(false), timeout)
        timer.unref?.()
        try {
            watcher = watch(directory, (_event, changedName) => {
                if (changedName && changedName.toString() !== targetName) return
                if (existsSync(file)) finish(true)
            })
            watcher.on('error', () => finish(false))
        } catch {
            finish(false)
        }
    })
}
