import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { usePlatform } from '@/hooks/usePlatform'
import { useTranslation } from '@/lib/use-translation'
import { InstallBanner, InstallGuideDialog, createInstallPromptViewModel } from './InstallPromptContent'

type InstallPromptProps = {
    suppressed?: boolean
}

export function InstallPrompt({ suppressed = false }: InstallPromptProps): JSX.Element | null {
    const { t } = useTranslation()
    const { installPlatform, promptInstall, dismissInstall, isStandalone } = usePWAInstall()
    const { haptic } = usePlatform()
    const [showIOSGuide, setShowIOSGuide] = useState(false)

    const isIOSGuide = installPlatform === 'ios'
    const promptModel = useMemo(() => createInstallPromptViewModel(t, isIOSGuide), [isIOSGuide, t])
    const isHidden = suppressed || isStandalone || installPlatform === null

    useEffect(() => {
        if (isHidden) {
            setShowIOSGuide(false)
        }
    }, [isHidden])

    const handleDismiss = useCallback((): void => {
        haptic.impact('light')
        setShowIOSGuide(false)
        dismissInstall()
    }, [dismissInstall, haptic])
    const handleCloseGuide = useCallback((): void => {
        setShowIOSGuide(false)
    }, [])

    const handlePrimaryAction = useCallback(async (): Promise<void> => {
        haptic.impact('light')
        if (isIOSGuide) {
            setShowIOSGuide(true)
            return
        }

        const installed = await promptInstall()
        if (installed) {
            haptic.notification('success')
        }
    }, [haptic, isIOSGuide, promptInstall])

    if (isHidden) {
        return null
    }

    return (
        <>
            {showIOSGuide ? (
                <InstallGuideDialog
                    model={promptModel.guide}
                    onClose={handleCloseGuide}
                    onDismiss={handleDismiss}
                />
            ) : null}
            <InstallBanner
                model={promptModel.banner}
                onPrimaryAction={() => void handlePrimaryAction()}
                onDismiss={handleDismiss}
            />
        </>
    )
}
