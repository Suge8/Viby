import { type ComponentProps, forwardRef, type Ref, useCallback } from 'react'
import { type Components as VirtuosoComponents, type ListProps as VirtuosoListProps } from 'react-virtuoso'
import { type TranscriptRenderRow } from '@/chat/transcriptTypes'
import { TranscriptRowView } from '@/components/transcript/TranscriptRowView'
import { joinClassNames } from '@/lib/joinClassNames'
import { SESSION_CHAT_VIEWPORT_TEST_ID, TRANSCRIPT_ROW_TEST_ID } from '@/lib/sessionUiContracts'
import { THREAD_VIEWPORT_CLASS_NAME } from './threadControls'

function isViewportOwnScrollEvent(event: { currentTarget: EventTarget | null; target: EventTarget | null }): boolean {
    return event.currentTarget === event.target
}

export type ThreadVirtuosoContext = {
    handleViewportScrollCapture: () => void
    handleViewportTouchMoveCapture: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportTouchStartCapture: (event: Pick<TouchEvent, 'touches'>) => void
    handleViewportWheelCapture: (event: Pick<WheelEvent, 'deltaY'>) => void
    setViewportRef: (viewport: HTMLDivElement | null) => void
    threadStageClassName: string
}

function setThreadViewportRef(
    value: HTMLDivElement | null,
    forwardedRef: Ref<HTMLDivElement> | undefined,
    setViewportRef: (viewport: HTMLDivElement | null) => void
): void {
    setViewportRef(value)

    if (!forwardedRef) {
        return
    }
    if (typeof forwardedRef === 'function') {
        forwardedRef(value)
        return
    }

    forwardedRef.current = value
}

const ThreadScroller = forwardRef<HTMLDivElement, ComponentProps<'div'> & { context: ThreadVirtuosoContext }>(
    function ThreadScroller(scrollerProps, forwardedRef) {
        const {
            className,
            context,
            onScrollCapture,
            onTouchMoveCapture,
            onTouchStartCapture,
            onWheelCapture,
            ...domProps
        } = scrollerProps
        const handleRef = useCallback(
            (value: HTMLDivElement | null) => {
                setThreadViewportRef(value, forwardedRef, context.setViewportRef)
            },
            [context.setViewportRef, forwardedRef]
        )

        return (
            <div
                {...domProps}
                data-testid={SESSION_CHAT_VIEWPORT_TEST_ID}
                ref={handleRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                className={joinClassNames(THREAD_VIEWPORT_CLASS_NAME, className)}
                onScrollCapture={(event) => {
                    onScrollCapture?.(event)
                    if (!isViewportOwnScrollEvent(event)) {
                        return
                    }
                    context.handleViewportScrollCapture()
                }}
                onWheelCapture={(event) => {
                    onWheelCapture?.(event)
                    context.handleViewportWheelCapture(event.nativeEvent)
                }}
                onTouchStartCapture={(event) => {
                    onTouchStartCapture?.(event)
                    context.handleViewportTouchStartCapture(event.nativeEvent)
                }}
                onTouchMoveCapture={(event) => {
                    onTouchMoveCapture?.(event)
                    context.handleViewportTouchMoveCapture(event.nativeEvent)
                }}
            />
        )
    }
)
ThreadScroller.displayName = 'ThreadScroller'

const ThreadList = forwardRef<HTMLDivElement, VirtuosoListProps & { context: ThreadVirtuosoContext }>(
    function ThreadList(listProps, forwardedRef) {
        const { children, context, style, ...domProps } = listProps
        return (
            <div
                {...domProps}
                ref={forwardedRef}
                style={style}
                className={joinClassNames(context.threadStageClassName, 'ds-thread-lane')}
            >
                {children}
            </div>
        )
    }
)
ThreadList.displayName = 'ThreadList'

export function ThreadHeaderSpacer(): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className="ds-thread-top-anchor-spacer"
            style={{ height: 'var(--chat-header-anchor-space)' }}
        />
    )
}

export function ThreadFooterSpacer(): React.JSX.Element {
    return (
        <div
            aria-hidden="true"
            className="ds-thread-bottom-anchor-spacer"
            style={{ height: 'var(--chat-composer-occupied-space)' }}
        />
    )
}

export const THREAD_VIRTUOSO_COMPONENTS = {
    Footer: ThreadFooterSpacer,
    Header: ThreadHeaderSpacer,
    List: ThreadList,
    Scroller: ThreadScroller,
} satisfies VirtuosoComponents<TranscriptRenderRow, ThreadVirtuosoContext>

export function renderThreadTranscriptItem(options: {
    index: number
    item: TranscriptRenderRow
    lastRowId: string | null
}): React.JSX.Element {
    const trailingGap = options.item.row.id === options.lastRowId ? 'none' : options.item.gap

    return (
        <div
            className="ds-transcript-row"
            data-row-gap={trailingGap}
            data-conversation-id={options.item.row.conversationId}
            data-history-jump-target={options.item.row.type === 'user' ? 'true' : undefined}
            data-row-index={options.index}
            data-testid={TRANSCRIPT_ROW_TEST_ID}
        >
            <TranscriptRowView row={options.item.row} />
        </div>
    )
}
