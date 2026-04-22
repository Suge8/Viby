import { watch } from 'fs/promises'
import { logger } from '@/ui/logger'
import { delay } from '@/utils/time'

export function startFileWatcher(file: string, onFileChange: (file: string) => void) {
    const abortController = new AbortController()

    void (async () => {
        while (true) {
            try {
                logger.debug(`[FILE_WATCHER] Starting watcher for ${file}`)
                const watcher = watch(file, { persistent: true, signal: abortController.signal })
                for await (const event of watcher) {
                    if (abortController.signal.aborted) {
                        return
                    }
                    logger.debug(`[FILE_WATCHER] File changed: ${file}`)
                    onFileChange(file)
                }
            } catch (e) {
                if (abortController.signal.aborted) {
                    return
                }
                const message = e instanceof Error ? e.message : String(e)
                logger.debug(`[FILE_WATCHER] Watch error: ${message}, restarting watcher in a second`)
                await delay(1000)
            }
        }
    })()

    return () => {
        abortController.abort()
    }
}
