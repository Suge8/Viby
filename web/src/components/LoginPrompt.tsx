import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { SettingsIcon } from '@/components/icons'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { LoginExperienceShell } from '@/components/login/LoginExperienceShell'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import type { ServerUrlResult } from '@/hooks/useServerUrl'
import { useNoticeCenter } from '@/lib/notice-center'
import { useTranslation } from '@/lib/use-translation'

const HUB_SERVER_ERROR_ID = 'login-server-error'
const HUB_TRIGGER_CLASS_NAME = 'viby-login-server-trigger rounded-full px-2 py-1'
const HUB_INPUT_CLASS_NAME = 'ds-field-control-elevated'

export type LoginPromptServerConfig = {
    baseUrl: string
    serverUrl: string | null
    requireServerUrl?: boolean
    setServerUrl: (input: string) => ServerUrlResult
    clearServerUrl: () => void
}

type LoginPromptProps = {
    server: LoginPromptServerConfig
    error?: string | null
}

function buildServerSummary(server: LoginPromptServerConfig, defaultLabel: string): string {
    return server.serverUrl ?? `${server.baseUrl} ${defaultLabel}`
}

/**
 * Unauthenticated landing page. Pairing happens through the desktop invite
 * flow (`/p/:pairingId` → verify-code), so this screen no longer hosts a
 * 6-digit input form. It directs the visitor to invite this device from the
 * desktop, and exposes the optional Hub origin dialog for advanced users.
 */
export function LoginPrompt(props: LoginPromptProps): JSX.Element {
    const { error: externalError, server } = props
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    useFinalizeBootShell()
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(server.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)
    const lastExternalErrorRef = useRef<string | null>(null)

    const showLoginError = useCallback(
        (description: string): void => {
            addToast({ tone: 'danger', title: t('login.error.title'), description })
        },
        [addToast, t]
    )

    useEffect(() => {
        if (!externalError || lastExternalErrorRef.current === externalError) return
        lastExternalErrorRef.current = externalError
        showLoginError(t(externalError))
    }, [externalError, showLoginError, t])

    useEffect(() => {
        if (!isServerDialogOpen) return
        setServerInput(server.serverUrl ?? '')
    }, [isServerDialogOpen, server.serverUrl])

    const handleSaveServer = useCallback(
        (event: React.FormEvent<HTMLFormElement>): void => {
            event.preventDefault()
            const result = server.setServerUrl(serverInput)
            if (!result.ok) {
                setServerError(result.error)
                return
            }
            setServerError(null)
            setServerInput(result.value)
            setIsServerDialogOpen(false)
        },
        [server, serverInput]
    )

    const handleClearServer = useCallback((): void => {
        server.clearServerUrl()
        setServerInput('')
        setServerError(null)
        setIsServerDialogOpen(false)
    }, [server])

    const handleServerDialogOpenChange = useCallback((open: boolean): void => {
        setIsServerDialogOpen(open)
        if (!open) setServerError(null)
    }, [])

    const handleServerInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        setServerInput(event.target.value)
        setServerError(null)
    }, [])

    const serverSummary = buildServerSummary(server, t('login.server.default'))
    const showServerSettings = Boolean(server.requireServerUrl || server.serverUrl)
    const loginPanel = (
        <div className="viby-login-login-panel">
            <div className="viby-login-login-panel__header">
                <h1>{t('login.panel.inviteTitle')}</h1>
                <p className="ds-login-server-hint">{t('login.panel.inviteHint')}</p>
            </div>

            {showServerSettings ? (
                <div className="viby-login-login-panel__footer">
                    <Dialog open={isServerDialogOpen} onOpenChange={handleServerDialogOpenChange}>
                        <DialogTrigger asChild>
                            <Button type="button" variant="ghost" size="sm" className={HUB_TRIGGER_CLASS_NAME}>
                                <SettingsIcon className="h-4 w-4" />
                                Hub {server.serverUrl ? t('login.server.custom') : t('login.server.default')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>{t('login.server.title')}</DialogTitle>
                                <DialogDescription>{t('login.server.description')}</DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSaveServer} className="space-y-4">
                                <div className="text-xs text-[var(--app-hint)]">
                                    {t('login.server.current')} {serverSummary}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium">{t('login.server.origin')}</label>
                                    <Input
                                        type="url"
                                        value={serverInput}
                                        onChange={handleServerInputChange}
                                        placeholder={t('login.server.placeholder')}
                                        aria-describedby={serverError ? HUB_SERVER_ERROR_ID : undefined}
                                        aria-invalid={serverError ? true : undefined}
                                        className={HUB_INPUT_CLASS_NAME}
                                    />
                                    <div className="ds-login-server-hint text-[var(--app-hint)]">
                                        {t('login.server.hint')}
                                    </div>
                                </div>

                                {serverError ? (
                                    <p
                                        id={HUB_SERVER_ERROR_ID}
                                        role="alert"
                                        className="ds-field-error text-xs leading-5"
                                    >
                                        {serverError}
                                    </p>
                                ) : null}

                                <div className="flex items-center justify-end gap-2">
                                    {server.serverUrl && (
                                        <Button type="button" variant="outline" onClick={handleClearServer}>
                                            {t('login.server.useSameOrigin')}
                                        </Button>
                                    )}
                                    <Button type="submit">{t('login.server.save')}</Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            ) : null}
        </div>
    )

    return (
        <LoginExperienceShell
            t={t}
            languageSwitcher={<LanguageSwitcher />}
            loginPanel={loginPanel}
            footer={
                <div>
                    {t('login.footer.copyright')} {new Date().getFullYear()} Viby
                </div>
            }
        />
    )
}
