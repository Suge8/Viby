import { useCallback, useState } from 'react'
import { createLanPairingSession, deleteLanPairingSession, isTauriRuntimeAvailable } from '@/lib/desktopApi'
import type { DesktopLanPairingSession, PairingSessionSnapshot } from '@/types'

export interface DesktopLanPairingsApi {
    draft: DesktopLanPairingSession | null
    actionError: string | null
    busy: boolean
    createDraft(inviteBaseUrl: string): Promise<DesktopLanPairingSession | null>
    applySnapshot(snapshot: PairingSessionSnapshot): void
    cancelDraft(): Promise<void>
}

/**
 * LAN pairing draft host state. Unlike broker pairings (long-lived,
 * persisted, multi-device) LAN invites are short-lived single-shot tickets,
 * so we only keep one live draft at a time and never persist across restart.
 */
export function useDesktopLanPairings(): DesktopLanPairingsApi {
    const [draft, setDraft] = useState<DesktopLanPairingSession | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const createDraft = useCallback(async (inviteBaseUrl: string): Promise<DesktopLanPairingSession | null> => {
        if (!isTauriRuntimeAvailable()) {
            setActionError('当前环境不支持局域网邀请。')
            return null
        }
        setBusy(true)
        setActionError(null)
        try {
            const created = await createLanPairingSession(inviteBaseUrl)
            setDraft(created)
            return created
        } catch (error) {
            const message = error instanceof Error ? error.message : '生成局域网邀请失败。'
            setActionError(message)
            return null
        } finally {
            setBusy(false)
        }
    }, [])

    const applySnapshot = useCallback((snapshot: PairingSessionSnapshot) => {
        setDraft((current) =>
            current && current.pairing.id === snapshot.id ? { ...current, pairing: snapshot } : current
        )
    }, [])

    const cancelDraft = useCallback(async (): Promise<void> => {
        const target = draft
        if (!target) return
        setDraft(null)
        if (target.pairing.approvalStatus === 'approved') return
        try {
            await deleteLanPairingSession(target)
        } catch (error) {
            const message = error instanceof Error ? error.message : '取消局域网邀请失败。'
            setActionError(message)
        }
    }, [draft])

    return { draft, actionError, busy, createDraft, applySnapshot, cancelDraft }
}
