import { logger } from '@/ui/logger'
import { CodexSessionScannerImpl } from './codexSessionScannerImpl'
import { normalizePath } from './codexSessionScannerSupport'
import type { CodexSessionScanner, CodexSessionScannerOptions } from './codexSessionScannerTypes'

export type { CodexSessionScanner, CodexSessionScannerOptions } from './codexSessionScannerTypes'

export async function createCodexSessionScanner(opts: CodexSessionScannerOptions): Promise<CodexSessionScanner> {
    const targetCwd = opts.cwd && opts.cwd.trim().length > 0 ? normalizePath(opts.cwd) : null

    if (!targetCwd && !opts.sessionId) {
        const message = 'No cwd provided for Codex session matching; refusing to fallback.'
        logger.warn(`[CODEX_SESSION_SCANNER] ${message}`)
        opts.onSessionMatchFailed?.(message)
        return {
            cleanup: async () => {},
            onNewSession: () => {},
        }
    }

    const scanner = new CodexSessionScannerImpl(opts, targetCwd)
    await scanner.start()

    return {
        cleanup: async () => {
            await scanner.cleanup()
        },
        onNewSession: (sessionId: string) => {
            scanner.onNewSession(sessionId)
        },
    }
}
