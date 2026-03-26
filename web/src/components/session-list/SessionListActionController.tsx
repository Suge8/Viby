import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu.contract'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { getSessionTitle } from '@/lib/sessionPresentation'
import { useTranslation } from '@/lib/use-translation'
import {
    getSessionActionDialogConfig,
    type SessionActionDialogKind
} from './sessionActionDialogPresentation'

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
        onSelectSession: (sessionId: string) => void
        onArchiveSelectedSession?: (sessionId: string) => void
    }
}

export function SessionListActionController(
    props: SessionListActionControllerProps
): React.JSX.Element {
    const { t } = useTranslation()
    const { api, session, anchorPoint, callbacks } = props
    const { onArchiveSelectedSession, onDismiss, onSelectSession } = callbacks
    const [surface, setSurface] = useState<SessionActionSurface>({ kind: 'menu' })
    const sessionId = session.id
    const title = getSessionTitle(session)
    const dialogKind: SessionActionDialogKind = surface.kind === 'confirm' ? surface.dialogKind : null
    const dialogConfig = getSessionActionDialogConfig(dialogKind, title, t)

    const {
        archiveSession,
        closeSession,
        deleteSession,
        isPending,
        renameSession,
        resumeSession,
        unarchiveSession
    } = useSessionActions(api, sessionId, session.metadata?.flavor ?? null)

    useEffect(() => {
        setSurface({ kind: 'menu' })
    }, [sessionId])

    const openRenameDialog = useCallback(() => {
        setSurface({ kind: 'rename' })
    }, [])

    const openConfirmDialog = useCallback((nextDialogKind: Exclude<SessionActionDialogKind, null>) => {
        setSurface({ kind: 'confirm', dialogKind: nextDialogKind })
    }, [])

    const handleResume = useCallback(async () => {
        onDismiss()
        const resumedSession = await resumeSession()
        onSelectSession(resumedSession.id)
    }, [onDismiss, onSelectSession, resumeSession])

    const handleConfirm = useCallback(async () => {
        switch (dialogKind) {
            case 'archive':
                await archiveSession()
                onArchiveSelectedSession?.(sessionId)
                return
            case 'close':
                await closeSession()
                return
            case 'delete':
                await deleteSession()
                return
            case 'unarchive':
                await unarchiveSession()
                return
            default:
                return
        }
    }, [
        archiveSession,
        closeSession,
        deleteSession,
        dialogKind,
        onArchiveSelectedSession,
        sessionId,
        unarchiveSession
    ])

    return (
        <>
            <SessionActionMenu
                overlay={{
                    isOpen: surface.kind === 'menu',
                    onClose: onDismiss,
                    anchorPoint
                }}
                session={{
                    lifecycleState: session.lifecycleState,
                    resumeAvailable: session.resumeAvailable
                }}
                actions={{
                    onRename: openRenameDialog,
                    onResume: () => void handleResume(),
                    onCloseSession: () => openConfirmDialog('close'),
                    onArchive: () => openConfirmDialog('archive'),
                    onUnarchive: () => openConfirmDialog('unarchive'),
                    onDelete: () => openConfirmDialog('delete')
                }}
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
                    destructive: dialogKind === 'archive' || dialogKind === 'delete'
                }}
                onConfirm={handleConfirm}
                isPending={isPending}
            />
        </>
    )
}
