import { type FSWatcher, watch } from 'fs'
import { logger } from '@/ui/logger'
import { delay } from '@/utils/time'

const WATCH_RESTART_DELAY_MS = 1000

export function startFileWatcher(file: string, onFileChange: (file: string) => void) {
    let stopped = false
    let watcher: FSWatcher | null = null

    async function restart(): Promise<void> {
        if (stopped) {
            return
        }

        logger.debug(`[FILE_WATCHER] Watcher restarting in a second: ${file}`)
        await delay(WATCH_RESTART_DELAY_MS)
        start()
    }

    function closeCurrent(): void {
        watcher?.close()
        watcher = null
    }

    function start(): void {
        if (stopped) {
            return
        }

        try {
            logger.debug(`[FILE_WATCHER] Starting watcher for ${file}`)
            watcher = watch(file, { persistent: true }, () => {
                logger.debug(`[FILE_WATCHER] File changed: ${file}`)
                onFileChange(file)
            })
            watcher.once('error', (error) => {
                if (stopped) {
                    return
                }
                logger.debug(`[FILE_WATCHER] Watch error: ${error.message}`)
                closeCurrent()
                void restart()
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.debug(`[FILE_WATCHER] Watch error: ${message}`)
            void restart()
        }
    }

    start()

    return () => {
        stopped = true
        closeCurrent()
    }
}
