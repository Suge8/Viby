import { type JSX, useCallback, useEffect, useState } from 'react'
import { authenticateWithAccessToken } from '@/api/authClient'
import { InlineNotice } from '@/components/InlineNotice'
import { SettingsIcon } from '@/components/icons'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { LoginExperienceShell } from '@/components/login/LoginExperienceShell'
import { Spinner } from '@/components/Spinner'
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
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

const ACCESS_TOKEN_AUTOCOMPLETE = 'new-password'
const ACCESS_TOKEN_INPUT_NAME = 'accessToken'
const ACCESS_TOKEN_TITLE_ID = 'login-access-key-title'
const ACCESS_TOKEN_INPUT_CLASS_NAME = 'ds-field-control-elevated py-4 text-base'
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
    onLogin?: (token: string) => void
    server: LoginPromptServerConfig
    error?: string | null
}

function buildServerSummary(server: LoginPromptServerConfig, defaultLabel: string): string {
    return server.serverUrl ?? `${server.baseUrl} ${defaultLabel}`
}

export function LoginPrompt(props: LoginPromptProps): JSX.Element {
    const { error: externalError, onLogin, server } = props
    const { t } = useTranslation()
    useFinalizeBootShell()
    const loginErrorPreset = getNoticePreset('loginError', t)
    const loginServerErrorPreset = getNoticePreset('loginServerError', t)
    const [accessToken, setAccessToken] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(server.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)

    const handleSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
            event.preventDefault()

            const trimmedToken = accessToken.trim()
            if (!trimmedToken) {
                setError(t('login.error.enterToken'))
                return
            }

            if (server.requireServerUrl && !server.serverUrl) {
                setServerError(t('login.server.required'))
                setIsServerDialogOpen(true)
                return
            }

            setIsLoading(true)
            setError(null)

            try {
                await authenticateWithAccessToken(server.baseUrl, trimmedToken)
                if (!onLogin) {
                    setError(t('login.error.loginUnavailable'))
                    return
                }
                onLogin(trimmedToken)
            } catch (e) {
                setError(
                    formatUserFacingErrorMessage(e, {
                        t,
                        fallbackKey: 'login.error.authFailed',
                    })
                )
            } finally {
                setIsLoading(false)
            }
        },
        [accessToken, onLogin, server.baseUrl, server.requireServerUrl, server.serverUrl, t]
    )

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
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
        if (!open) {
            setServerError(null)
        }
    }, [])

    const handleAccessTokenChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        setAccessToken(event.target.value)
    }, [])

    const handleServerInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        setServerInput(event.target.value)
        setServerError(null)
    }, [])

    const displayError = error || externalError
    const serverSummary = buildServerSummary(server, t('login.server.default'))
    const showServerSettings = Boolean(server.requireServerUrl || server.serverUrl)
    const loginPanel = (
        <div className="viby-login-login-panel">
            <form onSubmit={handleSubmit} autoComplete="off" className="viby-login-login-panel__form">
                <div className="viby-login-login-panel__header">
                    <h1 id={ACCESS_TOKEN_TITLE_ID}>{t('login.panel.inputLabel')}</h1>
                </div>
                <Input
                    id={ACCESS_TOKEN_INPUT_NAME}
                    type="password"
                    name={ACCESS_TOKEN_INPUT_NAME}
                    aria-labelledby={ACCESS_TOKEN_TITLE_ID}
                    value={accessToken}
                    onChange={handleAccessTokenChange}
                    placeholder={t('login.placeholder')}
                    autoComplete={ACCESS_TOKEN_AUTOCOMPLETE}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="text"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    disabled={isLoading}
                    className={`${ACCESS_TOKEN_INPUT_CLASS_NAME} viby-login-access-key-input`}
                />

                {displayError && (
                    <InlineNotice
                        tone={loginErrorPreset.tone}
                        title={loginErrorPreset.title}
                        description={displayError}
                        className="text-left"
                    />
                )}

                <Button
                    type="submit"
                    disabled={isLoading || !accessToken.trim()}
                    aria-busy={isLoading}
                    size="lg"
                    className="viby-login-submit"
                >
                    {isLoading ? (
                        <>
                            <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                            {t('login.submitting')}
                        </>
                    ) : (
                        t('login.submit')
                    )}
                </Button>
            </form>

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
                                        className={HUB_INPUT_CLASS_NAME}
                                    />
                                    <div className="ds-login-server-hint text-[var(--app-hint)]">
                                        {t('login.server.hint')}
                                    </div>
                                </div>

                                {serverError && (
                                    <InlineNotice
                                        tone={loginServerErrorPreset.tone}
                                        title={loginServerErrorPreset.title}
                                        description={serverError}
                                    />
                                )}

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
