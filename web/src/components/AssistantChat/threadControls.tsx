import type { ReactNode } from 'react'
import { AppNotice } from '@/components/AppNotice'
import { ArrowDownIcon, ArrowUpIcon } from '@/components/icons'
import { CHAT_MESSAGE_SKELETON_ROWS } from '@/components/loading/chatSkeletonRows'
import { SkeletonRows } from '@/components/loading/LoadingSkeleton'
import { Spinner } from '@/components/Spinner'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import { joinClassNames } from '@/lib/joinClassNames'
import { THREAD_BOTTOM_CONTROL_TEST_ID, THREAD_HISTORY_CONTROL_TEST_ID } from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'

const THREAD_HISTORY_CONTROL_INSET_CLASS_NAME = 'pt-[var(--ds-session-chat-history-control-inset)]'
const THREAD_SIDE_CONTROL_BASE_CLASS_NAME =
    'session-chat-thread-side-control ds-thread-side-control-base ds-floating-control disabled:cursor-default disabled:opacity-85 md:text-xs'
const THREAD_HISTORY_CONTROL_CLASS_NAME = `${THREAD_SIDE_CONTROL_BASE_CLASS_NAME} ds-thread-history-control session-chat-thread-history-control ${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}`
const THREAD_HISTORY_CONTROL_WRAPPER_CLASS_NAME = 'ds-thread-history-control-wrapper'
const THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME =
    'session-chat-thread-bottom-control-anchor ds-thread-bottom-control-wrapper'
const THREAD_CONTROL_WRAPPER_HIDDEN_CLASS_NAME = 'ds-thread-side-control-hidden'
const THREAD_BOTTOM_CONTROL_CLASS_NAME = `${THREAD_SIDE_CONTROL_BASE_CLASS_NAME} ds-thread-bottom-control session-chat-thread-bottom-control ${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}`
const THREAD_SIDE_CONTROL_PENDING_DOT_CLASS_NAME = 'ds-thread-side-control-pending-dot'
const THREAD_SIDE_CONTROL_ICON_STROKE_WIDTH = 2.2

export const THREAD_VIEWPORT_CLASS_NAME =
    'session-chat-thread-viewport viby-thread-viewport min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain'
export const THREAD_STAGE_CLASS_NAME = 'mx-auto w-full ds-stage-shell min-w-0 p-3'
export const THREAD_BUFFER_SIZE = 320

function getHistoryControlLabel(options: { loading: boolean; t: (key: string) => string }): string {
    if (options.loading) {
        return options.t('misc.loading')
    }

    return options.t('misc.previousUserMessage')
}

function getThreadBottomControlAccessibleLabel(options: {
    count: number
    t: (key: string, params?: Record<string, string | number>) => string
}): string {
    if (options.count > 0) {
        return options.t('misc.newMessage', { n: options.count })
    }

    return options.t('misc.backToBottom')
}

export function getThreadStageClassName(options: { reserveHistoryControlInset: boolean }): string {
    return joinClassNames(
        THREAD_STAGE_CLASS_NAME,
        options.reserveHistoryControlInset && THREAD_HISTORY_CONTROL_INSET_CLASS_NAME
    )
}

export function ThreadBottomControl(props: {
    count: number
    visible: boolean
    onClick: () => void
}): React.JSX.Element {
    const { t } = useTranslation()
    const accessibleLabel = getThreadBottomControlAccessibleLabel({
        count: props.count,
        t,
    })
    const hasPendingMessages = props.count > 0

    return (
        <div
            className={joinClassNames(
                THREAD_BOTTOM_CONTROL_WRAPPER_CLASS_NAME,
                !props.visible && THREAD_CONTROL_WRAPPER_HIDDEN_CLASS_NAME
            )}
        >
            <Button
                data-testid={THREAD_BOTTOM_CONTROL_TEST_ID}
                type="button"
                size="iconSm"
                onPointerDown={(event) => {
                    event.preventDefault()
                }}
                onClick={props.onClick}
                aria-label={accessibleLabel}
                title={accessibleLabel}
                variant="secondary"
                className={THREAD_BOTTOM_CONTROL_CLASS_NAME}
                disabled={!props.visible}
                aria-hidden={!props.visible}
                tabIndex={props.visible ? 0 : -1}
            >
                <ArrowDownIcon aria-hidden="true" strokeWidth={THREAD_SIDE_CONTROL_ICON_STROKE_WIDTH} />
                {hasPendingMessages ? (
                    <span aria-hidden="true" className={THREAD_SIDE_CONTROL_PENDING_DOT_CLASS_NAME} />
                ) : null}
            </Button>
        </div>
    )
}

export function ThreadHistoryControl(props: {
    visible: boolean
    loading: boolean
    disabled: boolean
    onClick: () => void
}): React.JSX.Element {
    const { t } = useTranslation()

    const label = getHistoryControlLabel({
        loading: props.loading,
        t,
    })

    return (
        <div
            className={joinClassNames(
                THREAD_HISTORY_CONTROL_WRAPPER_CLASS_NAME,
                !props.visible && THREAD_CONTROL_WRAPPER_HIDDEN_CLASS_NAME
            )}
        >
            <Button
                type="button"
                size="iconSm"
                data-testid={THREAD_HISTORY_CONTROL_TEST_ID}
                onPointerDown={(event) => {
                    event.preventDefault()
                }}
                onClick={() => {
                    props.onClick()
                }}
                disabled={props.disabled || !props.visible}
                aria-busy={props.loading}
                aria-label={label}
                title={label}
                variant="secondary"
                className={THREAD_HISTORY_CONTROL_CLASS_NAME}
                aria-hidden={!props.visible}
                tabIndex={props.visible ? 0 : -1}
            >
                {props.loading ? (
                    <Spinner size="sm" label={null} className="text-current" />
                ) : (
                    <ArrowUpIcon aria-hidden="true" strokeWidth={THREAD_SIDE_CONTROL_ICON_STROKE_WIDTH} />
                )}
            </Button>
        </div>
    )
}

export function MessageSkeleton(): React.JSX.Element {
    const { t } = useTranslation()

    return <SkeletonRows label={t('misc.loadingMessages')} rows={CHAT_MESSAGE_SKELETON_ROWS} />
}

export function ThreadNotice(props: { title: string; tone?: 'default' | 'warning' }): ReactNode {
    return <AppNotice layout="inline" tone={props.tone} title={props.title} className="ds-thread-notice" />
}
