import type { InteractivePermissionRequest } from '@viby/protocol/types'
import { useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InlineNotice } from '@/components/InlineNotice'
import {
    buildPermissionSessionToolIdentifier,
    canAllowPermissionForSession,
    getPermissionToolSummary,
    isCodexPermissionSurface,
    isEditPermissionTool,
} from '@/components/interactive-request/interactiveRequestPermissionSupport'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { usePlatform } from '@/hooks/usePlatform'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'
import type { Session } from '@/types/api'

type InteractivePermissionRequestPanelProps = {
    api: ApiClient
    session: Session
    request: InteractivePermissionRequest
}

type ActionButtonProps = {
    label: string
    tone?: 'danger'
    loading?: boolean
    disabled: boolean
    onClick: () => void
}

function ActionButton(props: ActionButtonProps): React.JSX.Element {
    return (
        <Button
            type="button"
            variant={props.tone === 'danger' ? 'destructive' : 'secondary'}
            className="w-full"
            disabled={props.disabled}
            aria-busy={props.loading ? 'true' : 'false'}
            onClick={props.onClick}
        >
            {props.loading ? <Spinner size="sm" label={null} className="mr-2 text-current" /> : null}
            {props.label}
        </Button>
    )
}

export function InteractivePermissionRequestPanel(props: InteractivePermissionRequestPanelProps): React.JSX.Element {
    const { t } = useTranslation()
    const requestFailedPreset = getNoticePreset('toolRequestFailed', t)
    const { haptic } = usePlatform()
    const [loadingKey, setLoadingKey] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const codex = isCodexPermissionSurface(props.session, props.request.toolName)
    const toolSummary = getPermissionToolSummary(props.request.input)

    async function run(actionKey: string, action: () => Promise<void>): Promise<void> {
        setLoadingKey(actionKey)
        setError(null)
        try {
            await action()
            haptic.notification('success')
        } catch (nextError) {
            haptic.notification('error')
            setError(
                formatUserFacingErrorMessage(nextError, {
                    t,
                    fallbackKey: 'tool.requestFailed',
                })
            )
        } finally {
            setLoadingKey(null)
        }
    }

    const canAllowForSession = canAllowPermissionForSession(props.request.toolName, codex)
    const canAllowAllEdits = !codex && isEditPermissionTool(props.request.toolName)
    const disabled = loadingKey !== null

    return (
        <div className="interactive-request-panel-body flex min-h-0 flex-1 flex-col">
            {error ? (
                <div className="mb-3">
                    <InlineNotice
                        tone={requestFailedPreset.tone}
                        title={requestFailedPreset.title}
                        description={error}
                        className="px-2.5 py-2 text-xs shadow-none"
                    />
                </div>
            ) : null}

            <div className="text-sm font-medium text-[var(--app-fg)]">{props.request.toolName}</div>
            {toolSummary ? <div className="mt-1 break-words text-sm text-[var(--app-hint)]">{toolSummary}</div> : null}

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
                {codex ? (
                    <>
                        <ActionButton
                            label={t('tool.yes')}
                            loading={loadingKey === 'approve'}
                            disabled={disabled}
                            onClick={() =>
                                void run('approve', () =>
                                    props.api.approvePermission(props.session.id, props.request.id, {
                                        decision: 'approved',
                                    })
                                )
                            }
                        />
                        <ActionButton
                            label={t('tool.yesForSession')}
                            loading={loadingKey === 'approve-session'}
                            disabled={disabled}
                            onClick={() =>
                                void run('approve-session', () =>
                                    props.api.approvePermission(props.session.id, props.request.id, {
                                        decision: 'approved_for_session',
                                    })
                                )
                            }
                        />
                        <ActionButton
                            label={t('tool.abortLabel')}
                            tone="danger"
                            loading={loadingKey === 'abort'}
                            disabled={disabled}
                            onClick={() =>
                                void run('abort', () =>
                                    props.api.denyPermission(props.session.id, props.request.id, { decision: 'abort' })
                                )
                            }
                        />
                    </>
                ) : (
                    <>
                        <ActionButton
                            label={t('tool.allow')}
                            loading={loadingKey === 'approve'}
                            disabled={disabled}
                            onClick={() =>
                                void run('approve', () =>
                                    props.api.approvePermission(props.session.id, props.request.id)
                                )
                            }
                        />
                        {canAllowAllEdits ? (
                            <ActionButton
                                label={t('tool.allowAllEdits')}
                                loading={loadingKey === 'approve-edits'}
                                disabled={disabled}
                                onClick={() =>
                                    void run('approve-edits', () =>
                                        props.api.approvePermission(props.session.id, props.request.id, 'acceptEdits')
                                    )
                                }
                            />
                        ) : null}
                        {canAllowForSession ? (
                            <ActionButton
                                label={t('tool.yesForSession')}
                                loading={loadingKey === 'approve-session'}
                                disabled={disabled}
                                onClick={() =>
                                    void run('approve-session', () =>
                                        props.api.approvePermission(props.session.id, props.request.id, {
                                            allowTools: [
                                                buildPermissionSessionToolIdentifier(
                                                    props.request.toolName,
                                                    props.request.input
                                                ),
                                            ],
                                        })
                                    )
                                }
                            />
                        ) : null}
                        <ActionButton
                            label={t('tool.deny')}
                            tone="danger"
                            loading={loadingKey === 'deny'}
                            disabled={disabled}
                            onClick={() =>
                                void run('deny', () => props.api.denyPermission(props.session.id, props.request.id))
                            }
                        />
                    </>
                )}
            </div>
        </div>
    )
}
