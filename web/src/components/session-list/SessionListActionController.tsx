import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { SessionSummary } from '@/types/api'
import { SessionActionMenu } from '@/components/SessionActionMenu'
import { RenameSessionDialog } from '@/components/RenameSessionDialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { FloatingActionMenuAnchorPoint } from '@/components/ui/FloatingActionMenu'
import { useSessionActions } from '@/hooks/mutations/useSessionActions'
import { getSessionTitle } from '@/lib/sessionPresentation'
import { useTranslation } from '@/lib/use-translation'
import {
    getSessionActionDialogConfig,
    type SessionActionDialogKind
} from './sessionActionDialogPresentation'

type SessionListActionControllerProps = {
    api: ApiClient | null
    session: SessionSummary
    overlay: {
        anchorPoint: FloatingActionMenuAnchorPoint
        isMenuOpen: boolean
    }
    callbacks: {
        onCloseMenu: () => void
        onDismiss: () => void
        onSelectSession: (sessionId: string) => void
    }
}

export function SessionListActionController(
    props: SessionListActionControllerProps
): React.JSX.Element {
    const { t } = useTranslation()
    const {
        api,
        session,
        overlay,
        callbacks
    } = props
    const { anchorPoint, isMenuOpen } = overlay
    const { onCloseMenu, onDismiss, onSelectSession } = callbacks
    const [renameOpen, setRenameOpen] = useState(false)
    const [dialogKind, setDialogKind] = useState<SessionActionDialogKind>(null)
    const sessionId = session.id
    const title = useMemo(() => getSessionTitle(session), [session])
    const dialogConfig = useMemo(() => {
        return getSessionActionDialogConfig(dialogKind, title, t)
    }, [dialogKind, t, title])

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
        setRenameOpen(false)
        setDialogKind(null)
    }, [sessionId])

    useEffect(() => {
        if (!isMenuOpen && !renameOpen && dialogKind === null) {
            onDismiss()
        }
    }, [dialogKind, isMenuOpen, onDismiss, renameOpen])

    const handleCloseRenameDialog = useCallback(() => {
        setRenameOpen(false)
    }, [])

    const handleCloseConfirmDialog = useCallback(() => {
        setDialogKind(null)
    }, [])

    const openRenameDialog = useCallback(() => {
        onCloseMenu()
        setDialogKind(null)
        setRenameOpen(true)
    }, [onCloseMenu])

    const openConfirmDialog = useCallback((nextDialogKind: Exclude<SessionActionDialogKind, null>) => {
        onCloseMenu()
        setRenameOpen(false)
        setDialogKind(nextDialogKind)
    }, [onCloseMenu])

    const handleResume = useCallback(async () => {
        onCloseMenu()
        const resumedSession = await resumeSession()
        onSelectSession(resumedSession.id)
    }, [onCloseMenu, onSelectSession, resumeSession])

    const handleConfirm = useCallback(async () => {
        switch (dialogKind) {
            case 'archive':
                await archiveSession()
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
    }, [archiveSession, closeSession, deleteSession, dialogKind, unarchiveSession])

    return (
        <>
            <SessionActionMenu
                isOpen={isMenuOpen}
                onClose={onCloseMenu}
                anchorPoint={anchorPoint}
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
                isOpen={renameOpen}
                onClose={handleCloseRenameDialog}
                currentName={title}
                onRename={renameSession}
                isPending={isPending}
            />

            <ConfirmDialog
                isOpen={dialogKind !== null && dialogConfig !== null}
                onClose={handleCloseConfirmDialog}
                title={dialogConfig?.title ?? ''}
                description={dialogConfig?.description ?? ''}
                confirmLabel={dialogConfig?.confirmLabel ?? ''}
                confirmingLabel={dialogConfig?.confirmingLabel ?? ''}
                onConfirm={handleConfirm}
                isPending={isPending}
                destructive={dialogKind === 'archive' || dialogKind === 'delete'}
            />
        </>
    )
}
