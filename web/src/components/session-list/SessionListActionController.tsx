import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { getSessionTitle } from '@/lib/sessionPresentation'
import { useTranslation } from '@/lib/use-translation'
import type { SessionSummary } from '@/types/api'
import { isConfirmableSessionActionId, type SessionActionId } from './sessionActionAvailability'
import { getSessionActionDialogConfig, type SessionActionDialogKind } from './sessionActionDialogPresentation'

type SessionActionSurface =
    | { kind: 'menu' }
    | { kind: 'rename' }
    | { kind: 'confirm'; dialogKind: Exclude<SessionActionDialogKind, null> }

type SessionListActionControllerProps = {
    api: ApiClient | null
    session: SessionSummary
    anchorPoint: FloatingActionMenuAnchorPoint
    callbacks: {
        onDismiss: () => void
    }
}

export function SessionListActionController(props: SessionListActionControllerProps): React.JSX.Element {
    const { t } = useTranslation()
    const { api, session, anchorPoint, callbacks } = props
    const { onDismiss } = callbacks
    const [surface, setSurface] = useState<SessionActionSurface>({ kind: 'menu' })
    const sessionId = session.id
    const title = getSessionTitle(session)
    const dialogKind: SessionActionDialogKind = surface.kind === 'confirm' ? surface.dialogKind : null
    const dialogConfig = getSessionActionDialogConfig(dialogKind, title, t)

    const { deleteSession, isPending, renameSession, stopSession } = useSessionActions(api, session)

    useEffect(() => {
        setSurface({ kind: 'menu' })
    }, [sessionId])

    const handleMenuActionSelect = useCallback((actionId: SessionActionId) => {
        if (actionId === 'rename') {
            setSurface({ kind: 'rename' })
            return
        }

        if (isConfirmableSessionActionId(actionId)) {
            setSurface({ kind: 'confirm', dialogKind: actionId })
        }
    }, [])

    const handleConfirm = useCallback(async () => {
        switch (dialogKind) {
            case 'stop':
                await stopSession()
                return
            case 'delete':
                await deleteSession()
                return
            default:
                return
        }
    }, [deleteSession, dialogKind, stopSession])

    return (
        <>
            <SessionActionMenu
                overlay={{
                    isOpen: surface.kind === 'menu',
                    onClose: onDismiss,
                    anchorPoint,
                }}
                session={{
                    lifecycleState: session.lifecycleState,
                }}
                onActionSelect={handleMenuActionSelect}
            />

            <RenameSessionDialog
                isOpen={surface.kind === 'rename'}
                onClose={onDismiss}
                currentName={title}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                dialog={{
                    isOpen: surface.kind === 'confirm' && dialogConfig !== null,
                    onClose: onDismiss,
                    title: dialogConfig?.title ?? '',
                    description: dialogConfig?.description ?? '',
                    confirmLabel: dialogConfig?.confirmLabel ?? '',
                    confirmingLabel: dialogConfig?.confirmingLabel ?? '',
                    destructive: dialogKind === 'delete',
                }}
                onConfirm={handleConfirm}
                isPending={isPending}
            />
        </>
    )
}
