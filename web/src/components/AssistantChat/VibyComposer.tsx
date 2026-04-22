import { ComposerPrimitive, useAssistantApi, useAssistantState } from '@assistant-ui/react'
import { isSessionInteractionDisabled } from '@viby/protocol'
import {
    lazy,
    memo,
    type ChangeEvent as ReactChangeEvent,
    type FormEvent as ReactFormEvent,
    Suspense,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react'
import { AssistantReplyingIndicator } from '@/components/AssistantChat/AssistantReplyingIndicator'
import { AttachmentItem } from '@/components/AssistantChat/AttachmentItem'
import { ComposerButtons } from '@/components/AssistantChat/ComposerButtons'
import { ComposerSuggestionsOverlay } from '@/components/AssistantChat/ComposerSuggestionsOverlay'
import type { ComposerPanelId, VibyComposerModel } from '@/components/AssistantChat/composerTypes'
import {
    getComposerPermissionModes,
    hasComposerControls,
} from '@/components/AssistantChat/useComposerControlsVisibility'
import { useComposerInputController } from '@/components/AssistantChat/useComposerInputController'
import { useComposerPlatform } from '@/components/AssistantChat/useComposerPlatform'
import { useComposerResumeHint } from '@/components/AssistantChat/useComposerResumeHint'
import { useReplyingIndicatorPresence } from '@/components/AssistantChat/useReplyingIndicatorPresence'
import {
    areAttachmentsReady,
    type ComposerAttachment,
    DEFAULT_AUTOCOMPLETE_PREFIXES,
    defaultSuggestionHandler,
    getComposerEnterKeyHint,
    getComposerPlaceholder,
} from '@/components/AssistantChat/vibyComposerSupport'
import { SESSION_COMPOSER_PREFILL_EVENT, type SessionComposerPrefillDetail } from '@/lib/sessionComposerBridge'
import { COMPOSER_INPUT_TEST_ID, SESSION_CHAT_COMPOSER_SURFACE_TEST_ID } from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'

const LazyComposerControlsOverlay = lazy(async () => import('@/components/AssistantChat/ComposerControlsOverlay'))

type VibyComposerProps = { model: VibyComposerModel }

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
        active = true,
        allowSendWhenInactive = false,
        controlledByUser = false,
        sessionDriver = null,
        attachmentsSupported = true,
    } = composerModel.config
    const { onCollaborationModeChange, onPermissionModeChange, onModelChange, onModelReasoningEffortChange } =
        composerModel.handlers
    const autocompleteSuggestions = composerModel.handlers.autocompleteSuggestions ?? defaultSuggestionHandler
    const autocompleteRefreshKey = composerModel.handlers.autocompleteRefreshKey ?? 0

    const permissionMode = rawPermissionMode ?? 'default'
    const model = rawModel ?? null

    const api = useAssistantApi()
    const composerText = useAssistantState(({ composer }) => composer.text)
    const attachmentCount = useAssistantState(({ composer }) => composer.attachments.length)
    const attachmentsReady = useAssistantState(({ composer }) =>
        areAttachmentsReady(composer.attachments as readonly ComposerAttachment[])
    )
    const threadIsRunning = useAssistantState(({ thread }) => thread.isRunning)
    const threadIsDisabled = useAssistantState(({ thread }) => thread.isDisabled)

    const controlsDisabled =
        disabled || isSessionInteractionDisabled({ active, allowSendWhenInactive }) || threadIsDisabled
    const switchDriverPending = composerModel.config.switchDriverPending === true
    const trimmed = composerText.trim()
    const hasText = trimmed.length > 0
    const hasAttachments = attachmentCount > 0
    const canSend = (hasText || hasAttachments) && attachmentsReady && !controlsDisabled && !threadIsRunning

    const [isAborting, setIsAborting] = useState(false)
    const controlsButtonAnchorRef = useRef<HTMLDivElement | null>(null)
    const suggestionsAnchorRef = useRef<HTMLDivElement | null>(null)
    const replyingIndicatorPresence = useReplyingIndicatorPresence(replyingPhase)
    const { showResumePlaceholder, clearResumeHint } = useComposerResumeHint({
        active,
        allowSendWhenInactive,
        controlledByUser,
    })

    const { haptic, isTouch } = useComposerPlatform()

    const abortDisabled = controlsDisabled || isAborting || !threadIsRunning
    const showControlsButton = useMemo(
        () => hasComposerControls(composerModel.config, composerModel.handlers),
        [composerModel.config, composerModel.handlers]
    )
    const permissionModes = useMemo(() => getComposerPermissionModes(sessionDriver), [sessionDriver])
    const [openPanel, setOpenPanel] = useState<ComposerPanelId | null>(null)
    const [hasRequestedControlsOverlay, setHasRequestedControlsOverlay] = useState(false)

    useEffect(() => {
        if (!isAborting) return
        if (threadIsRunning) return
        setIsAborting(false)
    }, [isAborting, threadIsRunning])

    useEffect(() => {
        if (controlsDisabled || !showControlsButton || switchDriverPending) {
            setOpenPanel(null)
        }
    }, [controlsDisabled, showControlsButton, switchDriverPending])

    const handleAbort = useCallback(() => {
        if (abortDisabled) return
        haptic('error')
        setIsAborting(true)
        api.thread().cancelRun()
    }, [abortDisabled, api, haptic])

    const handleFormSubmit = useCallback((event: ReactFormEvent<HTMLFormElement>) => {
        // Keep send on the explicit button / shortcut path only.
        event.preventDefault()
    }, [])

    const handleTogglePanel = useCallback(
        (panel: ComposerPanelId) => {
            if (controlsDisabled || !showControlsButton || switchDriverPending) {
                return
            }

            haptic('light')
            setHasRequestedControlsOverlay(true)
            setOpenPanel((currentPanel) => (currentPanel === panel ? null : panel))
        },
        [controlsDisabled, haptic, showControlsButton, switchDriverPending]
    )

    const handleSend = useCallback(() => {
        api.composer().send()
        clearResumeHint()
    }, [api, clearResumeHint])

    const composerInput = useComposerInputController({
        api,
        composerText,
        canSend,
        isTouch,
        threadIsRunning,
        permissionMode,
        permissionModes,
        autocompletePrefixes,
        autocompleteSuggestions,
        autocompleteRefreshKey,
        onSuggestionAction: composerModel.handlers.onSuggestionAction,
        sessionDriver,
        model,
        onAbort: handleAbort,
        onPermissionModeChange,
        onModelChange,
        onSendRequest: handleSend,
        haptic,
    })

    useEffect(() => {
        function handleExternalPrefill(event: Event): void {
            const customEvent = event as CustomEvent<SessionComposerPrefillDetail>
            if (customEvent.detail?.sessionId !== composerModel.sessionId) {
                return
            }

            api.composer().setText(customEvent.detail.text)
            clearResumeHint()
            const input = composerInput.textareaRef.current
            if (!input) {
                return
            }

            try {
                input.focus({ preventScroll: true })
            } catch {
                input.focus()
            }
        }

        window.addEventListener(SESSION_COMPOSER_PREFILL_EVENT, handleExternalPrefill)
        return () => {
            window.removeEventListener(SESSION_COMPOSER_PREFILL_EVENT, handleExternalPrefill)
        }
    }, [api, clearResumeHint, composerInput.textareaRef, composerModel.sessionId])
    const primaryButtonMode = threadIsRunning ? 'stop' : 'send'
    const primaryButtonDisabled = threadIsRunning ? abortDisabled : !canSend
    const composerPlaceholder = getComposerPlaceholder({
        isReadonlyHistory: !active && !allowSendWhenInactive,
        showResumePlaceholder,
        t,
    })

    const handleComposerChange = useCallback(
        (event: ReactChangeEvent<HTMLTextAreaElement>) => {
            composerInput.handleChange(event)
        },
        [composerInput]
    )

    const handlePrimaryAction = useCallback(() => {
        if (threadIsRunning) {
            handleAbort()
            return
        }

        handleSend()
    }, [handleAbort, handleSend, threadIsRunning])

    return (
        <ComposerPrimitive.Root onSubmit={handleFormSubmit}>
            <div className="relative">
                {replyingIndicatorPresence.visiblePhase ? (
                    <div className="ds-replying-indicator-anchor">
                        <AssistantReplyingIndicator
                            phase={replyingIndicatorPresence.visiblePhase}
                            state={replyingIndicatorPresence.state}
                        />
                    </div>
                ) : null}
                <ComposerSuggestionsOverlay
                    anchorRef={suggestionsAnchorRef}
                    hidden={openPanel !== null}
                    autocompleteLayout={composerModel.autocompleteLayout}
                    suggestions={composerInput.suggestions}
                    selectedIndex={composerInput.selectedIndex}
                    onSelectSuggestion={composerInput.handleSuggestionSelect}
                />
                {hasRequestedControlsOverlay && openPanel === 'controls' ? (
                    <Suspense fallback={null}>
                        <LazyComposerControlsOverlay
                            anchorRef={controlsButtonAnchorRef}
                            config={composerModel.config}
                            handlers={{
                                ...composerModel.handlers,
                            }}
                            controlsDisabled={controlsDisabled || switchDriverPending}
                            onClose={() => setOpenPanel(null)}
                        />
                    </Suspense>
                ) : null}

                <div className="ds-composer-surface" data-testid={SESSION_CHAT_COMPOSER_SURFACE_TEST_ID}>
                    {attachmentCount > 0 ? (
                        <div className="flex flex-wrap gap-2 px-4 pt-1.5 sm:pt-3">
                            <ComposerPrimitive.Attachments components={{ Attachment: AttachmentItem }} />
                        </div>
                    ) : null}

                    <div ref={suggestionsAnchorRef} className="flex items-center px-4 py-1.5 sm:py-3">
                        <ComposerPrimitive.Input
                            data-testid={COMPOSER_INPUT_TEST_ID}
                            ref={composerInput.textareaRef}
                            autoFocus={!controlsDisabled && !isTouch}
                            placeholder={composerPlaceholder}
                            disabled={controlsDisabled}
                            enterKeyHint={getComposerEnterKeyHint(isTouch)}
                            maxRows={5}
                            submitOnEnter={false}
                            cancelOnEscape={false}
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
                        controlsAnchorRef={controlsButtonAnchorRef}
                        controlsButton={{
                            visible: showControlsButton,
                            active: openPanel === 'controls',
                            disabled: controlsDisabled || switchDriverPending,
                            onToggle: () => handleTogglePanel('controls'),
                        }}
                        primaryAction={{
                            mode: primaryButtonMode,
                            disabled: primaryButtonDisabled,
                            busy: threadIsRunning && isAborting,
                            onClick: handlePrimaryAction,
                        }}
                    />
                </div>
            </div>
        </ComposerPrimitive.Root>
    )
}

export const VibyComposer = memo(VibyComposerInner)
VibyComposer.displayName = 'VibyComposer'
