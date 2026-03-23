import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { LoadingState } from '@/components/LoadingState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAppContext } from '@/lib/app-context'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useSession } from '@/hooks/queries/useSession'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import { SessionRouteHeader } from '@/routes/sessions/components/SessionRouteHeader'
import { ConnectionIndicator, TerminalQuickInputBar } from '@/routes/sessions/terminalQuickInput'
import { loadSessionTerminalViewModule } from '@/routes/sessions/sessionRoutePreload'
import { useTerminalPageController } from '@/routes/sessions/useTerminalPageController'

const TerminalView = lazy(async () => {
    const module = await loadSessionTerminalViewModule()
    return { default: module.TerminalView }
})

export default function TerminalPage(): ReactNode {
    const { t } = useTranslation()
    const warningPreset = getNoticePreset('genericWarning', t)
    const errorPreset = getNoticePreset('genericError', t)
    const infoPreset = getNoticePreset('genericInfo', t)
    const { sessionId } = useParams({ from: '/sessions/$sessionId/terminal' })
    const { api, token, baseUrl } = useAppContext()
    const goBack = useAppGoBack()
    const { session } = useSession(api, sessionId)
    const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
    const [manualPasteText, setManualPasteText] = useState('')

    const {
        altActive,
        ctrlActive,
        exitInfo,
        handleModifierToggle,
        handleQuickInput,
        handleResize,
        handleTerminalMount,
        quickInputDisabled,
        terminalState,
        writePlainInput,
    } = useTerminalPageController({
        baseUrl,
        sessionActive: session?.active === true,
        sessionId,
        token,
    })

    const handlePasteAction = useCallback(async () => {
        if (quickInputDisabled) {
            return
        }

        const readClipboard = navigator.clipboard?.readText
        if (readClipboard) {
            try {
                const clipboardText = await readClipboard.call(navigator.clipboard)
                if (!clipboardText) {
                    return
                }

                if (writePlainInput(clipboardText)) {
                    return
                }
            } catch {
                // Fall through to manual paste modal.
            }
        }

        setManualPasteText('')
        setPasteDialogOpen(true)
    }, [quickInputDisabled, writePlainInput])

    const handleManualPasteSubmit = useCallback(() => {
        if (!manualPasteText.trim()) {
            return
        }

        if (writePlainInput(manualPasteText)) {
            setPasteDialogOpen(false)
            setManualPasteText('')
        }
    }, [manualPasteText, writePlainInput])

    const statusLabel = useMemo(() => {
        switch (terminalState.status) {
            case 'connected':
                return t('terminal.status.connected')
            case 'connecting':
                return t('terminal.status.connecting')
            default:
                return t('terminal.status.offline')
        }
    }, [t, terminalState.status])

    if (!session) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label={t('loading.session')} className="text-sm" />
            </div>
        )
    }

    const subtitle = session.metadata?.path ?? sessionId

    return (
        <div className="flex h-full flex-col">
            <SessionRouteHeader
                title={t('terminal.title')}
                subtitle={subtitle}
                onBack={goBack}
                actions={<ConnectionIndicator status={terminalState.status} statusLabel={statusLabel} />}
            />

            {!session.active ? (
                <SessionRouteBanner
                    tone="warning"
                    title={warningPreset.title}
                    description={t('terminal.inactive')}
                />
            ) : null}

            {terminalState.status === 'error' && terminalState.error ? (
                <SessionRouteBanner
                    tone="error"
                    title={errorPreset.title}
                    description={terminalState.error}
                />
            ) : null}

            {exitInfo ? (
                <SessionRouteBanner
                    tone="info"
                    title={infoPreset.title}
                    description={t('terminal.exit', {
                        code: exitInfo.code !== null ? ` ${exitInfo.code}` : '',
                        signal: exitInfo.signal ? ` (${exitInfo.signal})` : '',
                    })}
                />
            ) : null}

            <div className="flex-1 overflow-hidden bg-[var(--app-bg)]">
                <div className="mx-auto h-full w-full ds-stage-shell p-3">
                    <Suspense fallback={<TerminalViewLoadingState />}>
                        <TerminalView
                            onMount={handleTerminalMount}
                            onResize={handleResize}
                            className="h-full w-full"
                        />
                    </Suspense>
                </div>
            </div>

            <TerminalQuickInputBar
                altActive={altActive}
                ctrlActive={ctrlActive}
                disabled={quickInputDisabled}
                onPaste={() => {
                    void handlePasteAction()
                }}
                onPress={handleQuickInput}
                onToggleModifier={handleModifierToggle}
                pasteLabel={t('button.paste')}
            />

            <Dialog
                open={pasteDialogOpen}
                onOpenChange={(open) => {
                    setPasteDialogOpen(open)
                    if (!open) {
                        setManualPasteText('')
                    }
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('terminal.paste.fallbackTitle')}</DialogTitle>
                        <DialogDescription>{t('terminal.paste.fallbackDescription')}</DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={manualPasteText}
                        onChange={(event) => setManualPasteText(event.target.value)}
                        placeholder={t('terminal.paste.placeholder')}
                        className="mt-2 min-h-32 w-full resize-y rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)]"
                        autoCapitalize="none"
                        autoCorrect="off"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                                setPasteDialogOpen(false)
                                setManualPasteText('')
                            }}
                        >
                            {t('button.cancel')}
                        </Button>
                        <Button
                            type="button"
                            onClick={handleManualPasteSubmit}
                            disabled={!manualPasteText.trim()}
                        >
                            {t('button.paste')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function TerminalViewLoadingState(): React.JSX.Element {
    const { t } = useTranslation()

    return (
        <div className="flex h-full items-center justify-center">
            <LoadingState label={t('loading.session')} className="text-sm" />
        </div>
    )
}
