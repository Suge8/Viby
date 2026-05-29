import { type FormEvent, type JSX, useState } from 'react'
import { ConnectionStatePage } from '@/components/ConnectionStatePage'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { RemoteConnectingPhase } from '@/lib/remoteConnectingPhase'
import { useTranslation } from '@/lib/use-translation'
import { RemoteConnectingScreen } from './RemoteConnectingScreen'

function normalizeCode(input: string): string {
    return input.replace(/\D/g, '').slice(0, 6)
}

function formatCode(input: string): string {
    return input.replace(/(\d{3})(\d+)/, '$1 $2')
}

interface RemotePairingCodeScreenProps {
    onSubmit: (code: string) => void
    submitting: boolean
}

export function RemotePairingCodeScreen(props: RemotePairingCodeScreenProps): JSX.Element {
    const { t } = useTranslation()
    const [code, setCode] = useState('')
    const normalizedCode = normalizeCode(code)
    const canSubmit = normalizedCode.length === 6 && !props.submitting

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()
        if (canSubmit) {
            props.onSubmit(normalizedCode)
        }
    }

    return (
        <ConnectionStatePage title={t('remotePairing.code.title')}>
            <form onSubmit={handleSubmit} className="ds-connection-form">
                <Input
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={formatCode(code)}
                    onChange={(event) => setCode(normalizeCode(event.target.value))}
                    className="ds-field-control-elevated ds-connection-code-input"
                    aria-label={t('remotePairing.code.inputLabel')}
                />
                <Button type="submit" size="lg" disabled={!canSubmit} pendingIndicator="none" className="w-full">
                    {props.submitting ? (
                        <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                    ) : null}
                    {t('remotePairing.code.submit')}
                </Button>
            </form>
        </ConnectionStatePage>
    )
}

export function RemotePairingStatusScreen(props: {
    message: string | null
    onRetry?: () => void
    phase?: RemoteConnectingPhase
}): JSX.Element {
    const { t } = useTranslation()

    if (!props.message) {
        return <RemoteConnectingScreen phase={props.phase ?? 'opening-app'} />
    }

    return (
        <ConnectionStatePage
            title={t('remotePairing.error.title')}
            description={props.message}
            actions={
                props.onRetry ? (
                    <Button type="button" onClick={props.onRetry}>
                        {t('remotePairing.error.retry')}
                    </Button>
                ) : null
            }
        />
    )
}

export function RemotePairingMissingScreen(): JSX.Element {
    const { t } = useTranslation()
    return <RemotePairingStatusScreen message={t('remotePairing.error.scanAgain')} />
}
