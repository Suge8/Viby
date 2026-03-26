import { ComposerPrimitive, useAssistantApi, useAssistantState } from '@assistant-ui/react'
import {
    Suspense,
    type ChangeEvent as ReactChangeEvent,
    type FormEvent as ReactFormEvent,
    lazy,
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react'
import { AssistantReplyingIndicator } from '@/components/AssistantChat/AssistantReplyingIndicator'
import { ComposerButtons } from '@/components/AssistantChat/ComposerButtons'
import { AttachmentItem } from '@/components/AssistantChat/AttachmentItem'
import { ComposerSuggestionsOverlay } from '@/components/AssistantChat/ComposerSuggestionsOverlay'
import { useComposerInputController } from '@/components/AssistantChat/useComposerInputController'
import { useComposerSessionWarmup } from '@/components/AssistantChat/useComposerSessionWarmup'
import { useReplyingIndicatorPresence } from '@/components/AssistantChat/useReplyingIndicatorPresence'
import type { ComposerPanelId, VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import {
    getComposerPermissionModes,
    hasComposerControls
} from '@/components/AssistantChat/useComposerControlsVisibility'
import { useComposerPlatform } from '@/components/AssistantChat/useComposerPlatform'
import { useTranslation } from '@/lib/use-translation'
import type { Suggestion } from '@/hooks/useActiveSuggestions'

const LazyComposerControlsOverlay = lazy(async () => import('@/components/AssistantChat/ComposerControlsOverlay'))

type VibyComposerProps = {
    model: VibyComposerModel
}

type ComposerAttachment = {
    status: { type: string }
    path?: string
}

const DEFAULT_AUTOCOMPLETE_PREFIXES = ['@', '/', '$'] as const
function defaultSuggestionHandler(): Promise<Suggestion[]> {
    return Promise.resolve([])
}

function getComposerPlaceholder(options: {
    isResuming: boolean
    showResumePlaceholder: boolean
    t: (key: string) => string
}): string {
    if (options.isResuming) {
        return options.t('misc.resumingSession')
    }
    if (options.showResumePlaceholder) {
        return options.t('misc.resumeMessage')
    }
    return options.t('misc.typeAMessage')
}

function isAttachmentReady(attachment: ComposerAttachment): boolean {
    if (attachment.status.type === 'complete') {
        return true
    }

    if (attachment.status.type !== 'requires-action') {
        return false
    }

    return typeof attachment.path === 'string' && attachment.path.length > 0
}

function areAttachmentsReady(
    attachments: readonly ComposerAttachment[]
): boolean {
    return attachments.length === 0 || attachments.every(isAttachmentReady)
}

function VibyComposerInner(props: VibyComposerProps): React.JSX.Element {
    const { t } = useTranslation()
    const { model: composerModel } = props
    const {
        disabled = false,
        autocompletePrefixes = DEFAULT_AUTOCOMPLETE_PREFIXES,
        replyingPhase = null,
    } = composerModel
    const {
        permissionMode: rawPermissionMode,
        model: rawModel,
        isResuming = false,
        active = true,
        allowSendWhenInactive = false,
        controlledByUser = false,
        agentFlavor = null,
        attachmentsSupported = true,
    } = composerModel.config
    const {
        onCollaborationModeChange,
        onPermissionModeChange,
        onModelChange,
        onModelReasoningEffortChange,
        onSwitchToRemote,
    } = composerModel.handlers
    const autocompleteSuggestions = composerModel.handlers.autocompleteSuggestions ?? defaultSuggestionHandler

    const permissionMode = rawPermissionMode ?? 'default'
    const model = rawModel ?? null

    const api = useAssistantApi()
    const composerText = useAssistantState(({ composer }) => composer.text)
    const attachments = useAssistantState(({ composer }) => composer.attachments)
    const threadIsRunning = useAssistantState(({ thread }) => thread.isRunning)
    const threadIsDisabled = useAssistantState(({ thread }) => thread.isDisabled)

    const controlsDisabled = disabled || isResuming || (!active && !allowSendWhenInactive) || threadIsDisabled
    const trimmed = composerText.trim()
    const hasText = trimmed.length > 0
    const hasAttachments = attachments.length > 0
    const attachmentsReady = areAttachmentsReady(
        attachments as readonly ComposerAttachment[]
    )
    const canSend = (hasText || hasAttachments) && attachmentsReady && !controlsDisabled && !threadIsRunning

    const [isAborting, setIsAborting] = useState(false)
    const [isSwitching, setIsSwitching] = useState(false)
    const [showResumeHint, setShowResumeHint] = useState(false)
    const overlayAnchorRef = useRef<HTMLDivElement | null>(null)

    const prevControlledByUser = useRef(controlledByUser)
    const replyingIndicatorPresence = useReplyingIndicatorPresence(replyingPhase)

    useEffect(() => {
        if (prevControlledByUser.current === true && controlledByUser === false) {
            setShowResumeHint(true)
        }
        if (controlledByUser) {
            setShowResumeHint(false)
        }
        prevControlledByUser.current = controlledByUser
    }, [controlledByUser])

    const showResumePlaceholder = !isResuming && (showResumeHint || (!active && allowSendWhenInactive))

    const { haptic, isTouch } = useComposerPlatform()

    const abortDisabled = controlsDisabled || isAborting || !threadIsRunning
    const switchDisabled = controlsDisabled || isSwitching || !controlledByUser
    const showControlsButton = useMemo(
        () => hasComposerControls(composerModel.config, composerModel.handlers),
        [composerModel.config, composerModel.handlers]
    )
    const permissionModes = useMemo(
        () => getComposerPermissionModes(agentFlavor),
        [agentFlavor]
    )
    const [openPanel, setOpenPanel] = useState<ComposerPanelId | null>(null)
    const [hasRequestedControlsOverlay, setHasRequestedControlsOverlay] = useState(false)

    useEffect(() => {
        if (!isAborting) return
        if (threadIsRunning) return
        setIsAborting(false)
    }, [isAborting, threadIsRunning])

    useEffect(() => {
        if (!isSwitching) return
        if (controlledByUser) return
        setIsSwitching(false)
    }, [isSwitching, controlledByUser])

    useEffect(() => {
        if (controlsDisabled || !showControlsButton) {
            setOpenPanel(null)
        }
    }, [controlsDisabled, showControlsButton])

    const handleAbort = useCallback(() => {
        if (abortDisabled) return
        haptic('error')
        setIsAborting(true)
        api.thread().cancelRun()
    }, [abortDisabled, api, haptic])

    const handleSwitch = useCallback(async () => {
        if (switchDisabled || !onSwitchToRemote) return
        haptic('light')
        setIsSwitching(true)
        try {
            await onSwitchToRemote()
        } catch {
            setIsSwitching(false)
        }
    }, [switchDisabled, onSwitchToRemote, haptic])

    const handleFormSubmit = useCallback((event: ReactFormEvent<HTMLFormElement>) => {
        // Keep send on the explicit button / shortcut path only.
        event.preventDefault()
    }, [])

    const handleTogglePanel = useCallback((panel: ComposerPanelId) => {
        if (controlsDisabled || !showControlsButton) {
            return
        }

        haptic('light')
        setHasRequestedControlsOverlay(true)
        setOpenPanel((currentPanel) => currentPanel === panel ? null : panel)
    }, [controlsDisabled, haptic, showControlsButton])

    const composerInput = useComposerInputController({
        api,
        composerText,
        canSend,
        threadIsRunning,
        permissionMode,
        permissionModes,
        autocompletePrefixes,
        autocompleteSuggestions,
        agentFlavor,
        model,
        onAbort: handleAbort,
        onPermissionModeChange,
        onModelChange,
        onSend: () => setShowResumeHint(false),
        haptic,
    })
    const composerWarmup = useComposerSessionWarmup({
        active,
        isResuming,
        onWarmSession: composerModel.onWarmSession
    })

    const primaryButtonMode = threadIsRunning ? 'stop' : 'send'
    const primaryButtonDisabled = threadIsRunning ? abortDisabled : !canSend
    const composerPlaceholder = getComposerPlaceholder({
        isResuming,
        showResumePlaceholder,
        t
    })

    const handleComposerChange = useCallback((event: ReactChangeEvent<HTMLTextAreaElement>) => {
        composerWarmup.handleTextIntent(event.target.value)
        composerInput.handleChange(event)
    }, [composerInput, composerWarmup])

    const handlePrimaryAction = useCallback(() => {
        if (threadIsRunning) {
            handleAbort()
            return
        }

        api.composer().send()
        setShowResumeHint(false)
    }, [threadIsRunning, handleAbort, api])

    return (
        <div ref={composerModel.containerRef} className="session-chat-composer-shell ds-composer-shell shrink-0 px-3">
            <div className="mx-auto w-full ds-stage-shell">
                <ComposerPrimitive.Root
                    onSubmit={handleFormSubmit}
                    aria-busy={isResuming ? 'true' : undefined}
                >
                    <div ref={overlayAnchorRef} className="relative">
                        {replyingIndicatorPresence.visiblePhase ? (
                            <AssistantReplyingIndicator
                                phase={replyingIndicatorPresence.visiblePhase}
                                state={replyingIndicatorPresence.state}
                            />
                        ) : null}
                        <ComposerSuggestionsOverlay
                            anchorRef={overlayAnchorRef}
                            hidden={openPanel !== null}
                            suggestions={composerInput.suggestions}
                            selectedIndex={composerInput.selectedIndex}
                            onSelectSuggestion={composerInput.handleSuggestionSelect}
                        />
                        {hasRequestedControlsOverlay && openPanel === 'controls' ? (
                            <Suspense fallback={null}>
                                <LazyComposerControlsOverlay
                                    anchorRef={overlayAnchorRef}
                                    config={composerModel.config}
                                    handlers={{
                                        ...composerModel.handlers,
                                        onSwitchToRemote: controlledByUser ? handleSwitch : undefined
                                    }}
                                    controlsDisabled={controlsDisabled}
                                    onClose={() => setOpenPanel(null)}
                                />
                            </Suspense>
                        ) : null}

                        <div className="ds-composer-surface">
                            {attachments.length > 0 ? (
                                <div className="flex flex-wrap gap-2 px-4 pt-1.5 sm:pt-3">
                                    <ComposerPrimitive.Attachments components={{ Attachment: AttachmentItem }} />
                                </div>
                            ) : null}

                            <div className="flex items-center px-4 py-1.5 sm:py-3">
                                <ComposerPrimitive.Input
                                    ref={composerInput.textareaRef}
                                    autoFocus={!controlsDisabled && !isTouch}
                                    placeholder={composerPlaceholder}
                                    disabled={controlsDisabled}
                                    maxRows={5}
                                    submitOnEnter={false}
                                    cancelOnEscape={false}
                                    onFocus={composerWarmup.handleFocus}
                                    onChange={handleComposerChange}
                                    onCompositionStart={composerInput.handleCompositionStart}
                                    onCompositionEnd={composerInput.handleCompositionEnd}
                                    onSelect={composerInput.handleSelect}
                                    onKeyDown={composerInput.handleKeyDown}
                                    onPaste={composerInput.handlePaste}
                                    className="flex-1 resize-none bg-transparent text-base leading-snug text-[var(--app-fg)] placeholder-[var(--app-hint)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>

                            <ComposerButtons
                                attachmentsSupported={attachmentsSupported}
                                attachmentDisabled={controlsDisabled}
                                controlsButton={{
                                    visible: showControlsButton,
                                    active: openPanel === 'controls',
                                    disabled: controlsDisabled,
                                    onToggle: () => handleTogglePanel('controls')
                                }}
                                primaryAction={{
                                    mode: primaryButtonMode,
                                    disabled: primaryButtonDisabled,
                                    busy: threadIsRunning && isAborting,
                                    onClick: handlePrimaryAction
                                }}
                            />
                        </div>
                    </div>
                </ComposerPrimitive.Root>
            </div>
        </div>
    )
}

export const VibyComposer = memo(VibyComposerInner)
VibyComposer.displayName = 'VibyComposer'
