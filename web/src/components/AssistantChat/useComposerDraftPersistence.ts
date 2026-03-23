import { useAssistantApi, useAssistantState } from '@assistant-ui/react'
import { useEffect, useRef } from 'react'
import {
    readBrowserStorageJson,
    removeBrowserStorageItem,
    writeBrowserStorageJson
} from '@/lib/browserStorage'

const COMPOSER_DRAFT_STORAGE_PREFIX = 'viby-composer-draft::'
export const COMPOSER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
type ComposerDraftRecord = {
    value: string
    updatedAt: number
}

type ComposerDraftSnapshot = {
    sessionId: string
    composerText: string
}

function getComposerDraftActivationScopeKey(sessionId: string, activationKey: string): string {
    return `${sessionId}::${activationKey}`
}

function getComposerDraftKey(sessionId: string): string {
    return `${COMPOSER_DRAFT_STORAGE_PREFIX}${sessionId}`
}

function removeComposerDraft(sessionId: string): void {
    removeBrowserStorageItem('local', getComposerDraftKey(sessionId))
}

function parseComposerDraftRecord(value: string): ComposerDraftRecord | null {
    try {
        const parsed = JSON.parse(value) as unknown
        if (!parsed || typeof parsed !== 'object') {
            return null
        }

        const record = parsed as Partial<ComposerDraftRecord>
        if (typeof record.value !== 'string' || typeof record.updatedAt !== 'number' || !Number.isFinite(record.updatedAt)) {
            return null
        }

        return {
            value: record.value,
            updatedAt: record.updatedAt
        }
    } catch {
        return null
    }
}

function readComposerDraft(sessionId: string, now: number): string | null {
    const record = readBrowserStorageJson({
        storage: 'local',
        key: getComposerDraftKey(sessionId),
        parse: parseComposerDraftRecord
    })
    if (!record) {
        return null
    }

    if (record.value.length === 0) {
        removeComposerDraft(sessionId)
        return null
    }

    if (now - record.updatedAt > COMPOSER_DRAFT_TTL_MS) {
        removeComposerDraft(sessionId)
        return null
    }

    return record.value
}

function writeComposerDraft(sessionId: string, value: string, now: number): void {
    if (value.length === 0) {
        removeComposerDraft(sessionId)
        return
    }

    const record: ComposerDraftRecord = {
        value,
        updatedAt: now
    }

    writeBrowserStorageJson('local', getComposerDraftKey(sessionId), record)
}

function flushComposerDraft(snapshot: ComposerDraftSnapshot): void {
    writeComposerDraft(snapshot.sessionId, snapshot.composerText, Date.now())
}

type UseComposerDraftPersistenceOptions = {
    sessionId: string
    activationKey: string
}

export function useComposerDraftPersistence(options: UseComposerDraftPersistenceOptions): void {
    const { sessionId, activationKey } = options
    const api = useAssistantApi()
    const composerText = useAssistantState(({ composer }) => composer.text)
    const activationScopeKey = getComposerDraftActivationScopeKey(sessionId, activationKey)
    const restoredScopeKeyRef = useRef<string | null>(null)
    const isActivationRestorePendingRef = useRef(false)
    const latestSnapshotRef = useRef<ComposerDraftSnapshot>({
        sessionId,
        composerText
    })

    latestSnapshotRef.current = {
        sessionId,
        composerText
    }

    useEffect(() => {
        if (restoredScopeKeyRef.current === activationScopeKey) {
            return
        }

        restoredScopeKeyRef.current = activationScopeKey
        isActivationRestorePendingRef.current = false
        const savedDraft = readComposerDraft(sessionId, Date.now())
        if (!savedDraft || savedDraft === composerText) {
            return
        }

        isActivationRestorePendingRef.current = true
        api.composer().setText(savedDraft)
    }, [activationScopeKey, api, composerText, sessionId])

    useEffect(() => {
        if (isActivationRestorePendingRef.current) {
            if (composerText.length === 0) {
                return
            }

            isActivationRestorePendingRef.current = false
        }

        writeComposerDraft(sessionId, composerText, Date.now())
    }, [activationScopeKey, composerText, sessionId])

    useEffect(() => {
        function handlePageHide(): void {
            flushComposerDraft(latestSnapshotRef.current)
        }

        function handleVisibilityChange(): void {
            if (document.visibilityState !== 'hidden') {
                return
            }

            flushComposerDraft(latestSnapshotRef.current)
        }

        window.addEventListener('pagehide', handlePageHide)
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('pagehide', handlePageHide)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [])
}
