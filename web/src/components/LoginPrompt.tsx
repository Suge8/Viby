import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { authenticateWithPairingCode } from '@/api/authClient'
import { ApiError } from '@/api/clientShared'
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
import { writeStoredDeviceBinding } from '@/hooks/deviceBindingStorage'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import type { ServerUrlResult } from '@/hooks/useServerUrl'
import { resolveClientPlatform } from '@/lib/clientPlatform'
import { useNoticeCenter } from '@/lib/notice-center'
import { getAccessTokenStorageKey } from '@/lib/storage/storageRegistry'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

const PAIRING_CODE_AUTOCOMPLETE = 'one-time-code'
const PAIRING_CODE_INPUT_NAME = 'pairingCode'
const PAIRING_CODE_TITLE_ID = 'login-pairing-code-title'
const PAIRING_CODE_ERROR_ID = 'login-pairing-code-error'
const HUB_SERVER_ERROR_ID = 'login-server-error'
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

function formatLoginError(error: unknown, t: (key: string) => string): string {
    if (error instanceof ApiError) {
        if (error.code === 'auth_rate_limited' || error.status === 429) return t('login.error.rateLimited')
        if (error.code === 'public_access_disabled' || error.status === 403)
            return t('login.error.publicAccessDisabled')
        if (error.status === 401) return t('login.error.invalidToken')
        if (error.status >= 500) return t('login.error.hubFailed')
        return t('login.error.hubRejected')
    }

    if (error instanceof TypeError) return t('login.error.hubUnreachable')
    return formatUserFacingErrorMessage(error, { t, fallbackKey: 'login.error.authFailed' })
}

export function LoginPrompt(props: LoginPromptProps): JSX.Element {
    const { error: externalError, onLogin, server } = props
    const { t } = useTranslation()
    const { addToast } = useNoticeCenter()
    useFinalizeBootShell()
    const [pairingCode, setPairingCode] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(server.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)
    const lastExternalErrorRef = useRef<string | null>(null)

    const showLoginError = useCallback(
        (description: string): void => {
            addToast({
                tone: 'danger',
                title: t('login.error.title'),
                description,
            })
        },
        [addToast, t]
    )

    const handleSubmit = useCallback(
        async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
            event.preventDefault()

            const normalizedCode = pairingCode.replace(/\D/g, '')
            if (normalizedCode.length !== 6) {
                showLoginError(t('login.error.enterToken'))
                return
            }

            if (server.requireServerUrl && !server.serverUrl) {
                setServerError(t('login.server.required'))
                setIsServerDialogOpen(true)
                return
            }

            setIsLoading(true)

            try {
                const platform = resolveClientPlatform()
                const auth = await authenticateWithPairingCode(server.baseUrl, normalizedCode, { platform })
                if (auth.device?.secret) {
                    writeStoredDeviceBinding(getAccessTokenStorageKey(server.baseUrl), {
                        deviceId: auth.device.id,
                        secret: auth.device.secret,
                    })
                }
                if (!onLogin) {
                    showLoginError(t('login.error.loginUnavailable'))
                    return
                }
                onLogin(normalizedCode)
            } catch (e) {
                showLoginError(formatLoginError(e, t))
            } finally {
                setIsLoading(false)
            }
        },
        [onLogin, pairingCode, server.baseUrl, server.requireServerUrl, server.serverUrl, showLoginError, t]
    )

    useEffect(() => {
        if (!externalError || lastExternalErrorRef.current === externalError) {
            return
        }
        lastExternalErrorRef.current = externalError
        showLoginError(externalError)
    }, [externalError, showLoginError])

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

    const handlePairingCodeChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        setPairingCode(
            event.target.value
                .replace(/\D/g, '')
                .slice(0, 6)
                .replace(/(\d{3})(\d+)/, '$1 $2')
        )
    }, [])

    const handleServerInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
        setServerInput(event.target.value)
        setServerError(null)
    }, [])

    const hasLoginError = Boolean(externalError)
    const serverSummary = buildServerSummary(server, t('login.server.default'))
    const showServerSettings = Boolean(server.requireServerUrl || server.serverUrl)
    const loginPanel = (
        <div className="viby-login-login-panel">
            <form onSubmit={handleSubmit} autoComplete="off" className="viby-login-login-panel__form">
                <div className="viby-login-login-panel__header">
                    <h1 id={PAIRING_CODE_TITLE_ID}>{t('login.panel.inputLabel')}</h1>
                </div>
                <Input
                    id={PAIRING_CODE_INPUT_NAME}
                    type="text"
                    name={PAIRING_CODE_INPUT_NAME}
                    aria-labelledby={PAIRING_CODE_TITLE_ID}
                    aria-describedby={hasLoginError ? PAIRING_CODE_ERROR_ID : undefined}
                    aria-invalid={hasLoginError ? true : undefined}
                    value={pairingCode}
                    onChange={handlePairingCodeChange}
                    placeholder={t('login.placeholder')}
                    autoComplete={PAIRING_CODE_AUTOCOMPLETE}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    inputMode="numeric"
                    data-1p-ignore="true"
                    data-lpignore="true"
                    disabled={isLoading}
                    className={`${ACCESS_TOKEN_INPUT_CLASS_NAME} viby-login-access-key-input`}
                />

                <span id={PAIRING_CODE_ERROR_ID} className="sr-only">
                    {externalError || ''}
                </span>

                <Button
                    type="submit"
                    disabled={isLoading || pairingCode.replace(/\D/g, '').length !== 6}
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
