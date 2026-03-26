import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { formatRenameErrorMessage } from '@/lib/sessionRenameError'

function translate(key: string): string {
    return key
}

describe('formatRenameErrorMessage', () => {
    it('maps metadata conflicts to the retryable rename message', () => {
        const error = new ApiError('HTTP 409 Conflict: Session was modified concurrently. Please try again.', 409)

        expect(formatRenameErrorMessage(error, translate)).toBe('dialog.rename.conflict')
    })

    it('maps missing sessions to the not-found message', () => {
        const error = new ApiError('HTTP 404 Not Found: Session not found', 404)

        expect(formatRenameErrorMessage(error, translate)).toBe('dialog.rename.sessionNotFound')
    })

    it('uses the translated fallback for non-API failures', () => {
        expect(formatRenameErrorMessage(new Error('Session unavailable'), translate)).toBe('dialog.rename.error')
    })
})
