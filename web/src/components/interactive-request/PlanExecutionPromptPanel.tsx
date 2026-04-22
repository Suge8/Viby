import { useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InlineNotice } from '@/components/InlineNotice'
import type { PlanExecutionPrompt } from '@/components/interactive-request/planExecutionPromptSupport'
import { IMPLEMENT_PLAN_MESSAGE } from '@/components/interactive-request/planExecutionPromptSupport'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePlatform } from '@/hooks/usePlatform'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { Session } from '@/types/api'

type PlanExecutionPromptPanelProps = {
    api: ApiClient
    session: Session
    prompt: PlanExecutionPrompt
    onSend: (text: string) => void
    onDismiss: () => void
}

export function PlanExecutionPromptPanel(props: PlanExecutionPromptPanelProps): React.JSX.Element {
    const { t } = useTranslation()
    const requestFailedPreset = getNoticePreset('toolRequestFailed', t)
    const { haptic } = usePlatform()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setLoading(false)
        setError(null)
    }, [props.prompt.id])

    async function handleExecute(): Promise<void> {
        if (loading) {
            return
        }

        setLoading(true)
        setError(null)
        try {
            await props.api.setCollaborationMode(props.session.id, 'default')
            props.onDismiss()
            props.onSend(IMPLEMENT_PLAN_MESSAGE)
            haptic.notification('success')
        } catch (nextError) {
            haptic.notification('error')
            setError(
                formatUserFacingErrorMessage(nextError, {
                    t,
                    fallbackKey: 'dialog.error.default',
                })
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
            {error ? (
                <InlineNotice
                    tone={requestFailedPreset.tone}
                    title={requestFailedPreset.title}
                    description={error}
                    className="px-2.5 py-2 text-xs shadow-none"
                />
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-2">
                    <Badge variant="default">{t('tool.planExecution.badge')}</Badge>
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold text-[var(--app-fg)]">{props.prompt.title}</h2>
                        <p className="text-sm leading-6 text-[var(--app-hint)]">
                            {props.prompt.summary ?? t('tool.planExecution.description')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:self-end">
                    <Button type="button" variant="secondary" disabled={loading} onClick={props.onDismiss}>
                        {t('tool.planExecution.continue')}
                    </Button>
                    <Button type="button" disabled={loading} onClick={() => void handleExecute()}>
                        {loading ? t('misc.loading') : t('tool.planExecution.execute')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
