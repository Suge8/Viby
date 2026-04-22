import { getPendingInteractiveRequests } from '@viby/protocol'
import type { RefObject } from 'react'
import { memo, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InteractivePermissionRequestPanel } from '@/components/interactive-request/InteractivePermissionRequestPanel'
import { InteractiveQuestionRequestPanel } from '@/components/interactive-request/InteractiveQuestionRequestPanel'
import {
    InteractiveSurfacePresentation,
    PlanExecutionSurface,
} from '@/components/interactive-request/interactiveSurfacePresentation'
import { PlanExecutionPromptPanel } from '@/components/interactive-request/PlanExecutionPromptPanel'
import { getActivePlanExecutionPrompt } from '@/components/interactive-request/planExecutionPromptSupport'
import { useInteractiveSurfaceFrame } from '@/components/interactive-request/useInteractiveSurfaceFrame'
import { useDesktopSessionsLayout } from '@/hooks/useDesktopSessionsLayout'
import { usePlatform } from '@/hooks/usePlatform'
import { useTranslation } from '@/lib/use-translation'
import type { DecryptedMessage, Session } from '@/types/api'

type ActiveInteractiveRequestOwnerModel = {
    api: ApiClient
    composerHeight: number
    session: Session
    messages: DecryptedMessage[]
    isReplying: boolean
    onSend: (text: string) => void
}

type ActiveInteractiveRequestOwnerProps = {
    model: ActiveInteractiveRequestOwnerModel
    surfaceRef: RefObject<HTMLElement | null>
}

type InteractiveSurfaceShell = {
    frame: ReturnType<typeof useInteractiveSurfaceFrame>
    layout: 'desktop' | 'mobile'
    testId: string
}

function ActiveInteractiveRequestOwnerInner(props: ActiveInteractiveRequestOwnerProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const { isTouch } = usePlatform()
    const isDesktopLayout = useDesktopSessionsLayout()
    const [dismissedPlanPromptId, setDismissedPlanPromptId] = useState<string | null>(null)
    const frame = useInteractiveSurfaceFrame(props.surfaceRef)
    const pendingRequests = useMemo(
        () => getPendingInteractiveRequests(props.model.session.agentState),
        [props.model.session.agentState]
    )
    const activeRequest = pendingRequests[0] ?? null
    const pendingCount = pendingRequests.length
    const layout = isTouch || !isDesktopLayout ? 'mobile' : 'desktop'
    const planPrompt = useMemo(
        () =>
            getActivePlanExecutionPrompt({
                session: props.model.session,
                messages: props.model.messages,
                hasPendingInteractiveRequest: activeRequest !== null,
                isReplying: props.model.isReplying,
            }),
        [activeRequest, props.model.isReplying, props.model.messages, props.model.session]
    )
    const interactiveShell = useMemo<InteractiveSurfaceShell>(
        () => ({
            frame,
            layout,
            testId: 'interactive-request-owner',
        }),
        [frame, layout]
    )
    const planExecutionShell = useMemo<InteractiveSurfaceShell>(
        () => ({
            frame,
            layout,
            testId: 'plan-execution-owner',
        }),
        [frame, layout]
    )

    if (activeRequest) {
        return (
            <InteractiveSurfacePresentation
                shell={interactiveShell}
                header={{
                    badgeLabel: t('session.state.awaitingInput'),
                    status:
                        pendingCount > 1 ? (
                            <span className="text-xs text-[var(--app-hint)]">1/{pendingCount}</span>
                        ) : undefined,
                    description:
                        activeRequest.kind === 'question' ? t('tool.questionsAnswers') : t('tool.waitingForApproval'),
                }}
            >
                {activeRequest.kind === 'question' ? (
                    <InteractiveQuestionRequestPanel
                        api={props.model.api}
                        sessionId={props.model.session.id}
                        request={activeRequest}
                    />
                ) : (
                    <InteractivePermissionRequestPanel
                        api={props.model.api}
                        session={props.model.session}
                        request={activeRequest}
                    />
                )}
            </InteractiveSurfacePresentation>
        )
    }

    if (!planPrompt || dismissedPlanPromptId === planPrompt.id) {
        return null
    }

    return (
        <PlanExecutionSurface
            shell={planExecutionShell}
            composerHeight={props.model.composerHeight}
            label={t('tool.planExecution.badge')}
        >
            <PlanExecutionPromptPanel
                api={props.model.api}
                session={props.model.session}
                prompt={planPrompt}
                onSend={props.model.onSend}
                onDismiss={() => setDismissedPlanPromptId(planPrompt.id)}
            />
        </PlanExecutionSurface>
    )
}

export const ActiveInteractiveRequestOwner = memo(ActiveInteractiveRequestOwnerInner)
