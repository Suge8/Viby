type SessionActionDialogKind = 'archive' | 'close' | 'delete' | 'unarchive' | null

export type { SessionActionDialogKind }

export type SessionActionDialogConfig = {
    title: string
    description: string
    confirmLabel: string
    confirmingLabel: string
}

export function getSessionActionDialogConfig(
    dialogKind: SessionActionDialogKind,
    sessionTitle: string,
    t: (key: string, params?: Record<string, string | number>) => string
): SessionActionDialogConfig | null {
    switch (dialogKind) {
        case 'archive':
            return {
                title: t('dialog.archive.title'),
                description: t('dialog.archive.description', { name: sessionTitle }),
                confirmLabel: t('dialog.archive.confirm'),
                confirmingLabel: t('dialog.archive.confirming')
            }
        case 'close':
            return {
                title: t('dialog.close.title'),
                description: t('dialog.close.description', { name: sessionTitle }),
                confirmLabel: t('dialog.close.confirm'),
                confirmingLabel: t('dialog.close.confirming')
            }
        case 'delete':
            return {
                title: t('dialog.delete.title'),
                description: t('dialog.delete.description', { name: sessionTitle }),
                confirmLabel: t('dialog.delete.confirm'),
                confirmingLabel: t('dialog.delete.confirming')
            }
        case 'unarchive':
            return {
                title: t('dialog.unarchive.title'),
                description: t('dialog.unarchive.description', { name: sessionTitle }),
                confirmLabel: t('dialog.unarchive.confirm'),
                confirmingLabel: t('dialog.unarchive.confirming')
            }
        default:
            return null
    }
}
