import { logger } from '@/ui/logger'

export function runDetachedTask(task: () => void | Promise<unknown>, label: string): void {
    Promise.resolve()
        .then(() => task())
        .catch((error) => {
            logger.debug(label, error)
        })
}
