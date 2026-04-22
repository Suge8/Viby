import { useAssistantApi, useAssistantState } from '@assistant-ui/react'
import { useEffect, useRef } from 'react'
import {
    COMPOSER_DRAFT_TTL_MS,
    type ComposerDraftReadResult,
    clearComposerDraft,
    readComposerDraftFromFastPath,
    readComposerDraftFromIndexedDb,
    resetComposerDraftPersistenceForTests,
    writeComposerDraft,
} from '@/components/AssistantChat/composerDraftStore'
import { emitDraftTrace } from '@/components/AssistantChat/composerDraftTrace'

export { COMPOSER_DRAFT_TTL_MS, clearComposerDraft, resetComposerDraftPersistenceForTests }

type ComposerDraftSnapshot = {
    sessionId: string
    composerText: string
}

type UseComposerDraftPersistenceOptions = {
    sessionId: string
    activationKey: string
}

function getComposerDraftActivationScopeKey(sessionId: string, activationKey: string): string {
    return `${sessionId}::${activationKey}`
}

function flushComposerDraft(snapshot: ComposerDraftSnapshot, reason: string): void {
    if (snapshot.composerText.length === 0) {
        emitDraftTrace({
            type: 'flush-skip-empty',
            sessionId: snapshot.sessionId,
            valueLength: 0,
            reason,
        })
        return
    }

    writeComposerDraft(snapshot.sessionId, snapshot.composerText, Date.now(), reason)
}

function restoreCurrentActivation(options: {
    activationScopeKey: string
    cancelled: boolean
    currentActivationScopeKey: string | null
    currentComposerText: string
    savedDraft: ComposerDraftReadResult
    sessionId: string
    setRuntimeText: (value: string) => void
    markRestorePending: () => void
}): void {
    if (options.cancelled || options.currentActivationScopeKey !== options.activationScopeKey) {
        return
    }

    const { savedDraft, sessionId, currentComposerText } = options
    if (!savedDraft.value) {
        emitDraftTrace({
            type: 'restore-skipped',
            sessionId,
            valueLength: 0,
            reason: `${savedDraft.source ?? 'none'}:no-saved-draft`,
        })
        return
    }
    if (savedDraft.value === currentComposerText) {
        emitDraftTrace({
            type: 'restore-skipped',
            sessionId,
            valueLength: savedDraft.value.length,
            reason: `${savedDraft.source}:saved-draft-already-in-runtime`,
        })
        return
    }
    if (currentComposerText.length > 0) {
        emitDraftTrace({
            type: 'restore-skipped',
            sessionId,
            valueLength: savedDraft.value.length,
            reason: `${savedDraft.source}:runtime-dirty`,
        })
        return
    }

    emitDraftTrace({
        type: 'restore',
        sessionId,
        valueLength: savedDraft.value.length,
        reason: `${savedDraft.source}:activation-restore`,
    })
    options.markRestorePending()
    options.setRuntimeText(savedDraft.value)
}

export function useComposerDraftPersistence(options: UseComposerDraftPersistenceOptions): void {
    const { sessionId, activationKey } = options
    const api = useAssistantApi()
    const composerText = useAssistantState(({ composer }) => composer.text)
    const activationScopeKey = getComposerDraftActivationScopeKey(sessionId, activationKey)
    const restoredScopeKeyRef = useRef<string | null>(null)
    const isActivationRestorePendingRef = useRef(false)
    const currentComposerTextRef = useRef(composerText)
    const previousComposerTextRef = useRef(composerText)
    const latestSnapshotRef = useRef<ComposerDraftSnapshot>({
        sessionId,
        composerText,
    })

    currentComposerTextRef.current = composerText
    latestSnapshotRef.current = {
        sessionId,
        composerText,
    }

    useEffect(() => {
        if (restoredScopeKeyRef.current === activationScopeKey) {
            return
        }

        let cancelled = false
        restoredScopeKeyRef.current = activationScopeKey
        isActivationRestorePendingRef.current = false
        previousComposerTextRef.current = composerText

        const restoreArgs = {
            activationScopeKey,
            cancelled,
            currentActivationScopeKey: restoredScopeKeyRef.current,
            currentComposerText: currentComposerTextRef.current,
            sessionId,
            setRuntimeText: (value: string) => api.composer().setText(value),
            markRestorePending: () => {
                isActivationRestorePendingRef.current = true
            },
        }

        const fastPathDraft = readComposerDraftFromFastPath(sessionId, Date.now())
        if (fastPathDraft.value) {
            restoreCurrentActivation({
                ...restoreArgs,
                savedDraft: fastPathDraft,
            })
            return () => {
                cancelled = true
            }
        }

        void readComposerDraftFromIndexedDb(sessionId, Date.now()).then((savedIndexedDbDraft) => {
            restoreCurrentActivation({
                ...restoreArgs,
                cancelled,
                currentActivationScopeKey: restoredScopeKeyRef.current,
                currentComposerText: currentComposerTextRef.current,
                savedDraft: savedIndexedDbDraft,
            })
        })

        return () => {
            cancelled = true
        }
    }, [activationScopeKey, api, composerText, sessionId])

    useEffect(() => {
        const previousComposerText = previousComposerTextRef.current
        previousComposerTextRef.current = composerText

        if (isActivationRestorePendingRef.current) {
            if (composerText.length === 0) {
                return
            }

            isActivationRestorePendingRef.current = false
        }

        if (composerText.length === 0 && previousComposerText.length === 0) {
            return
        }

        writeComposerDraft(sessionId, composerText, Date.now(), 'composer-change')
    }, [activationScopeKey, composerText, sessionId])

    useEffect(() => {
        function handlePageHide(): void {
            flushComposerDraft(latestSnapshotRef.current, 'pagehide')
        }

        function handleVisibilityChange(): void {
            if (document.visibilityState !== 'hidden') {
                return
            }

            flushComposerDraft(latestSnapshotRef.current, 'visibilitychange-hidden')
        }

        window.addEventListener('pagehide', handlePageHide)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            flushComposerDraft(latestSnapshotRef.current, 'effect-cleanup-unmount')
            window.removeEventListener('pagehide', handlePageHide)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [])
}
