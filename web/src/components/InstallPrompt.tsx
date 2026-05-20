import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePlatform } from '@/hooks/usePlatform'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { ensureAppOverlayRoot } from '@/lib/overlayRoot'
import { useTranslation } from '@/lib/use-translation'
import { createInstallPromptViewModel, InstallBanner, InstallGuideDialog } from './InstallPromptContent'

type InstallPromptProps = {
    suppressed?: boolean
}

export function InstallPrompt({ suppressed = false }: InstallPromptProps): JSX.Element | null {
    const { t } = useTranslation()
    const { installPlatform, promptInstall, dismissInstall, isStandalone } = usePWAInstall()
    const { haptic } = usePlatform()
    const [showGuide, setShowGuide] = useState(false)
    const bannerPrimaryActionRef = useRef<HTMLButtonElement | null>(null)
    const shouldRestoreGuideFocusRef = useRef(false)

    const usesGuide =
        installPlatform === 'desktop-safari' || installPlatform === 'ios' || installPlatform === 'shortcut'
    const promptModel = useMemo(
        () => (installPlatform ? createInstallPromptViewModel(t, installPlatform) : null),
        [installPlatform, t]
    )
    const isHidden = suppressed || isStandalone || promptModel === null

    useEffect(() => {
        if (isHidden) {
            shouldRestoreGuideFocusRef.current = false
            setShowGuide(false)
        }
    }, [isHidden])

    useEffect(() => {
        if (showGuide || !shouldRestoreGuideFocusRef.current) return
        shouldRestoreGuideFocusRef.current = false
        bannerPrimaryActionRef.current?.focus()
    }, [showGuide])

    const handleDismiss = useCallback((): void => {
        haptic.impact('light')
        setShowGuide(false)
        dismissInstall()
    }, [dismissInstall, haptic])
    const handleCloseGuide = useCallback((): void => {
        shouldRestoreGuideFocusRef.current = true
        setShowGuide(false)
    }, [])

    const handlePrimaryAction = useCallback(async (): Promise<void> => {
        haptic.impact('light')
        if (usesGuide) {
            if (await promptInstall()) {
                setShowGuide(true)
            }
            return
        }

        const installed = await promptInstall()
        if (installed) {
            haptic.notification('success')
        }
    }, [haptic, promptInstall, usesGuide])

    if (isHidden || !promptModel) {
        return null
    }

    const overlayRoot = ensureAppOverlayRoot()
    if (!overlayRoot) {
        return null
    }

    return createPortal(
        <>
            {showGuide ? (
                <InstallGuideDialog model={promptModel.guide} onClose={handleCloseGuide} onDismiss={handleDismiss} />
            ) : (
                <InstallBanner
                    model={promptModel.banner}
                    primaryActionRef={bannerPrimaryActionRef}
                    onPrimaryAction={handlePrimaryAction}
                    onDismiss={handleDismiss}
                />
            )}
        </>,
        overlayRoot
    )
}
