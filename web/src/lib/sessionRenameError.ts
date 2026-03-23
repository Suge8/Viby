import { ApiError } from '@/api/client'

type TranslationFn = (key: string) => string

export function formatRenameErrorMessage(error: unknown, t: TranslationFn): string {
    if (error instanceof ApiError) {
        switch (error.status) {
            case 404:
                return t('dialog.rename.sessionNotFound')
            case 409:
                return t('dialog.rename.conflict')
            case 503:
                return t('dialog.rename.unavailable')
            default:
                return t('dialog.rename.error')
        }
    }

    return error instanceof Error && error.message
        ? error.message
        : t('dialog.rename.error')
}
