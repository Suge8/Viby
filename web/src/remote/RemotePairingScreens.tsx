import { type FormEvent, type JSX, useState } from 'react'
import { ConnectionStatePage } from '@/components/ConnectionStatePage'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/use-translation'

function normalizeCode(input: string): string {
    return input.replace(/\D/g, '').slice(0, 6)
}

function formatCode(input: string): string {
    return input.replace(/(\d{3})(\d+)/, '$1 $2')
}

export function RemotePairingCodeScreen(props: { onSubmit: (code: string) => void; submitting: boolean }): JSX.Element {
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
        <ConnectionStatePage
            eyebrow="Viby"
            title={t('remotePairing.code.title')}
            description={t('remotePairing.code.description')}
        >
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
                <Button type="submit" size="lg" disabled={!canSubmit} className="w-full">
                    {props.submitting ? (
                        <Spinner size="sm" label={null} className="text-[var(--app-button-text)]" />
                    ) : null}
                    {t('remotePairing.code.submit')}
                </Button>
            </form>
        </ConnectionStatePage>
    )
}

export function RemotePairingStatusScreen(props: { message: string | null; onRetry?: () => void }): JSX.Element {
    const { t } = useTranslation()

    if (!props.message) {
        return (
            <ConnectionStatePage
                busy
                eyebrow="Viby"
                title={t('remotePairing.connecting.title')}
                description={t('remotePairing.connecting.description')}
            />
        )
    }

    return (
        <ConnectionStatePage
            eyebrow="Viby"
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
