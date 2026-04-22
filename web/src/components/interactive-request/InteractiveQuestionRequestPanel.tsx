import type { InteractiveQuestionRequest } from '@viby/protocol/types'
import { useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'
import { InlineNotice } from '@/components/InlineNotice'
import {
    buildInteractiveQuestionAnswers,
    createInitialInteractiveQuestionAnswerState,
    hasInteractiveQuestionAnswer,
    type InteractiveQuestionAnswerState,
    setInteractiveQuestionCustomText,
    toggleInteractiveQuestionOption,
} from '@/components/interactive-request/interactiveRequestQuestionState'
import { ToolMarkdownQuestion } from '@/components/ToolCard/markdownContent'
import { ToolQuestionOptionRow } from '@/components/ToolCard/toolQuestionOptionRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { usePlatform } from '@/hooks/usePlatform'
import { getNoticePreset } from '@/lib/noticePresets'
import { useTranslation } from '@/lib/use-translation'
import { formatUserFacingErrorMessage } from '@/lib/userFacingError'

type InteractiveQuestionRequestPanelProps = {
    api: ApiClient
    sessionId: string
    request: InteractiveQuestionRequest
}

type InteractiveQuestionMode = InteractiveQuestionRequest['questions'][number]['mode']

export function InteractiveQuestionRequestPanel(props: InteractiveQuestionRequestPanelProps): React.JSX.Element {
    const { t } = useTranslation()
    const requestFailedPreset = getNoticePreset('toolRequestFailed', t)
    const { haptic } = usePlatform()
    const [step, setStep] = useState(0)
    const [answers, setAnswers] = useState<InteractiveQuestionAnswerState>(() =>
        createInitialInteractiveQuestionAnswerState(props.request)
    )
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        setStep(0)
        setAnswers(createInitialInteractiveQuestionAnswerState(props.request))
        setLoading(false)
        setError(null)
    }, [props.request.id])

    const total = Math.max(props.request.questions.length, 1)
    const currentStep = Math.min(Math.max(step, 0), total - 1)
    const currentQuestion = props.request.questions[currentStep]
    const currentEntry = currentQuestion ? answers[currentQuestion.id] : null
    const currentQuestionMode = currentQuestion?.mode ?? 'text-only'
    const customLabel = getInteractiveQuestionCustomLabel(currentQuestionMode, t)
    const customPlaceholder = getInteractiveQuestionPlaceholder(currentQuestionMode, t)

    async function handleSubmit(): Promise<void> {
        if (loading) {
            return
        }

        for (let index = 0; index < props.request.questions.length; index += 1) {
            const question = props.request.questions[index]
            if (!hasInteractiveQuestionAnswer(question, answers)) {
                setError(t('tool.selectOption'))
                setStep(index)
                return
            }
        }

        setLoading(true)
        setError(null)
        try {
            await props.api.approvePermission(
                props.sessionId,
                props.request.id,
                buildInteractiveQuestionAnswers(props.request, answers)
            )
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

    const canGoPrevious = currentStep > 0
    const canGoNext = Boolean(currentQuestion && hasInteractiveQuestionAnswer(currentQuestion, answers))

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

            <div className="flex items-center gap-2 text-xs text-[var(--app-hint)]">
                <Badge variant="default">{t('tool.question')}</Badge>
                <span className="font-mono">
                    [{currentStep + 1}/{total}]
                </span>
            </div>

            {currentQuestion ? (
                <div className="mt-3 flex min-h-0 flex-1 flex-col">
                    {currentQuestion.header ? (
                        <div className="text-xs font-medium text-[var(--app-hint)]">{currentQuestion.header}</div>
                    ) : null}
                    {currentQuestion.question ? (
                        <ToolMarkdownQuestion
                            text={currentQuestion.question}
                            className={currentQuestion.header ? 'mt-2' : undefined}
                        />
                    ) : null}

                    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                        {currentQuestion.options.length > 0 ? (
                            <div className="flex flex-col gap-1">
                                {currentQuestion.options.map((option, optionIndex) => {
                                    const checked = currentEntry?.selectedOptions.includes(option.label) ?? false
                                    return (
                                        <ToolQuestionOptionRow
                                            key={`${currentQuestion.id}:${optionIndex}`}
                                            checked={checked}
                                            mode={currentQuestion.multiSelect ? 'multi' : 'single'}
                                            disabled={loading}
                                            title={option.label}
                                            description={option.description}
                                            onClick={() => {
                                                haptic.selection()
                                                setAnswers((currentAnswers) =>
                                                    toggleInteractiveQuestionOption(
                                                        currentAnswers,
                                                        currentQuestion,
                                                        option.label
                                                    )
                                                )
                                            }}
                                        />
                                    )
                                })}
                            </div>
                        ) : null}

                        <div className="mt-3">
                            <div className="mb-1 text-xs text-[var(--app-hint)]">{customLabel}</div>
                            <Textarea
                                value={currentEntry?.customText ?? ''}
                                onChange={(event) => {
                                    setAnswers((currentAnswers) =>
                                        setInteractiveQuestionCustomText(
                                            currentAnswers,
                                            currentQuestion.id,
                                            event.target.value
                                        )
                                    )
                                }}
                                disabled={loading}
                                placeholder={customPlaceholder}
                                className="ds-toolcard-input-textarea bg-[var(--app-bg)] focus:border-transparent focus:ring-2 focus:ring-[var(--app-button)]"
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--app-border)] pt-4">
                <Button
                    type="button"
                    variant="secondary"
                    disabled={!canGoPrevious || loading}
                    onClick={() => setStep((value) => value - 1)}
                >
                    {t('misc.previous')}
                </Button>
                {currentStep < total - 1 ? (
                    <Button
                        type="button"
                        disabled={!canGoNext || loading}
                        onClick={() => setStep((value) => value + 1)}
                    >
                        {t('misc.next')}
                    </Button>
                ) : (
                    <Button type="button" disabled={loading} onClick={() => void handleSubmit()}>
                        {loading ? t('misc.loading') : t('tool.submit')}
                    </Button>
                )}
            </div>
        </div>
    )
}

function getInteractiveQuestionCustomLabel(mode: InteractiveQuestionMode, translate: (key: string) => string): string {
    if (mode === 'options-and-other') {
        return translate('tool.other')
    }

    return translate('tool.requestUserInput.noteLabel')
}

function getInteractiveQuestionPlaceholder(mode: InteractiveQuestionMode, translate: (key: string) => string): string {
    switch (mode) {
        case 'options-and-other':
            return translate('tool.askUserQuestion.placeholder')
        case 'options-and-note':
            return translate('tool.requestUserInput.notePlaceholder')
        case 'text-only':
            return translate('tool.requestUserInput.textPlaceholder')
    }
}
