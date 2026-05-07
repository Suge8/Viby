import { useCallback, useEffect, useState } from 'react'
import {
    checkForDesktopUpdate,
    type DesktopUpdateInfo,
    installDesktopUpdate,
    isTauriRuntimeAvailable,
} from '@/lib/desktopApi'
import { readAutoUpdateCheckEnabled, writeAutoUpdateCheckEnabled } from '@/lib/desktopUpdateSettings'

const AUTO_CHECK_DELAY_MS = 1200

export type DesktopUpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'installed' | 'error'

export interface DesktopUpdateState {
    autoCheckEnabled: boolean
    phase: DesktopUpdatePhase
    update: DesktopUpdateInfo | null
    message: string | null
}

export interface DesktopUpdateActions {
    checkNow(): Promise<void>
    install(): Promise<void>
    setAutoCheckEnabled(enabled: boolean): void
}

function getUpdateFoundMessage(update: DesktopUpdateInfo): string {
    return `发现 Viby Desktop ${update.version}。当前版本 ${update.currentVersion}。`
}

export function useDesktopUpdates(): DesktopUpdateState & DesktopUpdateActions {
    const [autoCheckEnabled, setAutoCheckEnabledState] = useState(readAutoUpdateCheckEnabled)
    const [phase, setPhase] = useState<DesktopUpdatePhase>('idle')
    const [update, setUpdate] = useState<DesktopUpdateInfo | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const runCheck = useCallback(async (surfaceErrors: boolean): Promise<void> => {
        if (!isTauriRuntimeAvailable()) {
            if (surfaceErrors) {
                setPhase('error')
                setMessage('当前是浏览器预览环境，无法检查桌面更新。')
            }
            return
        }

        setPhase('checking')
        setMessage(surfaceErrors ? '正在检查更新…' : null)

        try {
            const nextUpdate = await checkForDesktopUpdate()
            setUpdate(nextUpdate)
            setPhase(nextUpdate ? 'available' : 'current')
            setMessage(nextUpdate ? getUpdateFoundMessage(nextUpdate) : '已经是最新版本。')
        } catch (error) {
            setPhase('error')
            setMessage(surfaceErrors ? `检查更新失败：${error instanceof Error ? error.message : String(error)}` : null)
        }
    }, [])

    async function checkNow(): Promise<void> {
        await runCheck(true)
    }

    async function install(): Promise<void> {
        setPhase('installing')
        setMessage('正在下载并安装更新…')

        try {
            await installDesktopUpdate()
            setUpdate(null)
            setPhase('installed')
            setMessage('更新已安装。请重启 Viby Desktop 进入新版本。')
        } catch (error) {
            setPhase('error')
            setMessage(`安装更新失败：${error instanceof Error ? error.message : String(error)}`)
        }
    }

    function setAutoCheckEnabled(enabled: boolean): void {
        writeAutoUpdateCheckEnabled(enabled)
        setAutoCheckEnabledState(enabled)
    }

    useEffect(() => {
        if (!autoCheckEnabled) {
            return
        }

        const timeoutId = window.setTimeout(() => {
            void runCheck(false)
        }, AUTO_CHECK_DELAY_MS)

        return () => window.clearTimeout(timeoutId)
    }, [autoCheckEnabled, runCheck])

    return {
        autoCheckEnabled,
        phase,
        update,
        message,
        checkNow,
        install,
        setAutoCheckEnabled,
    }
}
