import type { ConfirmableSessionActionId } from './sessionActionAvailability'

type SessionActionDialogKind = ConfirmableSessionActionId | null

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
        case 'stop':
            return {
                title: t('dialog.stop.title'),
                description: t('dialog.stop.description', { name: sessionTitle }),
                confirmLabel: t('dialog.stop.confirm'),
                confirmingLabel: t('dialog.stop.confirming'),
            }
        case 'delete':
            return {
                title: t('dialog.delete.title'),
                description: t('dialog.delete.description', { name: sessionTitle }),
                confirmLabel: t('dialog.delete.confirm'),
                confirmingLabel: t('dialog.delete.confirming'),
            }
        default:
            return null
    }
}
