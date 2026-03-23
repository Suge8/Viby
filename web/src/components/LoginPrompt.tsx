import { type JSX, useCallback, useEffect, useState } from 'react'
import { ApiClient } from '@/api/client'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { InlineNotice } from '@/components/InlineNotice'
import { Spinner } from '@/components/Spinner'
import { BrandIcon, SettingsIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import type { ServerUrlResult } from '@/hooks/useServerUrl'

const ACCESS_TOKEN_AUTOCOMPLETE = 'new-password'
const ACCESS_TOKEN_INPUT_NAME = 'accessToken'
const ACCESS_TOKEN_INPUT_CLASS_NAME = 'w-full rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[var(--ds-elevated)] px-4 py-4 text-base text-[var(--app-fg)] placeholder:text-[var(--app-hint)] transition-colors focus:border-[var(--ds-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-brand)] disabled:opacity-50'
const HUB_TRIGGER_CLASS_NAME = 'rounded-[var(--ds-radius-pill)] px-2 py-1 text-[var(--app-hint)] hover:text-[var(--app-fg)]'
const HUB_INPUT_CLASS_NAME = 'w-full rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[var(--ds-elevated)] px-4 py-3 text-[var(--app-fg)] placeholder:text-[var(--app-hint)] focus:border-[var(--ds-border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-brand)]'

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
    const loginErrorPreset = getNoticePreset('loginError', t)
    const loginServerErrorPreset = getNoticePreset('loginServerError', t)
    const [accessToken, setAccessToken] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isServerDialogOpen, setIsServerDialogOpen] = useState(false)
    const [serverInput, setServerInput] = useState(server.serverUrl ?? '')
    const [serverError, setServerError] = useState<string | null>(null)

    const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
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
            const client = new ApiClient('', { baseUrl: server.baseUrl })
            await client.authenticate({ accessToken: trimmedToken })
            if (!onLogin) {
                setError(t('login.error.loginUnavailable'))
                return
            }
            onLogin(trimmedToken)
        } catch (e) {
            setError(e instanceof Error ? e.message : t('login.error.authFailed'))
        } finally {
            setIsLoading(false)
        }
    }, [accessToken, onLogin, server.baseUrl, server.requireServerUrl, server.serverUrl, t])

    useEffect(() => {
        if (!isServerDialogOpen) {
            return
        }
        setServerInput(server.serverUrl ?? '')
    }, [isServerDialogOpen, server.serverUrl])

    const handleSaveServer = useCallback((event: React.FormEvent<HTMLFormElement>): void => {
        event.preventDefault()
        const result = server.setServerUrl(serverInput)
        if (!result.ok) {
            setServerError(result.error)
            return
        }
        setServerError(null)
        setServerInput(result.value)
        setIsServerDialogOpen(false)
    }, [server, serverInput])

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

    return (
        <div className="relative flex h-full items-center justify-center overflow-hidden bg-[var(--ds-canvas)] p-4">
            <div className="absolute right-4 top-4">
                <LanguageSwitcher />
            </div>

            <div className="relative w-full max-w-md space-y-8 rounded-[var(--ds-radius-2xl)] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] p-6 shadow-[var(--ds-shadow-card)] md:p-8">
                <div className="space-y-4 text-center">
                    <BrandIcon className="ds-stage-empty-icon mx-auto h-14 w-14 text-[var(--ds-accent-lime)]" />
                    <div className="space-y-2">
                        <div className="text-3xl font-semibold tracking-[-0.04em] text-[var(--ds-text-primary)]">
                            {t('login.title')}
                        </div>
                    </div>
                    <div className="mx-auto max-w-xs text-sm leading-6 text-[var(--app-hint)]">
                        {t('login.subtitle')}
                    </div>
                </div>

                <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
                    <div>
                        <input
                            type="password"
                            name={ACCESS_TOKEN_INPUT_NAME}
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
                            className={ACCESS_TOKEN_INPUT_CLASS_NAME}
                        />
                    </div>

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
                        className="w-full"
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

                <div className="flex items-center justify-end border-t border-[var(--ds-border-subtle)] pt-1 text-xs text-[var(--app-hint)]">
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
                                <DialogDescription>
                                    {t('login.server.description')}
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSaveServer} className="space-y-4">
                                <div className="text-xs text-[var(--app-hint)]">
                                    {t('login.server.current')} {serverSummary}
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium">{t('login.server.origin')}</label>
                                    <input
                                        type="url"
                                        value={serverInput}
                                        onChange={handleServerInputChange}
                                        placeholder={t('login.server.placeholder')}
                                        className={HUB_INPUT_CLASS_NAME}
                                    />
                                    <div className="text-[11px] text-[var(--app-hint)]">
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
                                    <Button type="submit">
                                        {t('login.server.save')}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 space-y-1 text-center text-xs text-[var(--app-hint)]">
                <div>
                    {t('login.footer')} {t('login.footer.for')}
                </div>
                <div>
                    {t('login.footer.copyright')} {new Date().getFullYear()} Viby
                </div>
            </div>
        </div>
    )
}
