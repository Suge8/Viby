import { AnimatePresence, m, type Variants } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ConversationOutlineItem } from '@/chat/outline'
import { ConversationIcon } from '@/components/icons'
import { MOTION_EASE_EMPHASIZED } from '@/components/motion/motionPrimitives'
import { Button } from '@/components/ui/button'
import { ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME } from '@/components/ui/iconButtonStyles'
import {
    THREAD_OUTLINE_ITEM_TEST_ID,
    THREAD_OUTLINE_POPOVER_TEST_ID,
    THREAD_OUTLINE_TRIGGER_TEST_ID,
} from '@/lib/sessionUiContracts'
import { useTranslation } from '@/lib/use-translation'

const VIEWPORT_PADDING_PX = 8
const POPOVER_GAP_PX = 10
const POPOVER_WIDTH_PX = 320

type ConversationOutlineProps = {
    sessionId: string
    items: readonly ConversationOutlineItem[]
    onJump: (conversationId: string) => boolean
    hasMoreHistory: boolean
    isLoadingHistory: boolean
    isPreparingHistory: boolean
    onRequestMoreHistory: () => void
}

const OUTLINE_INITIAL_VISIBLE_COUNT = 5
const OUTLINE_REVEAL_STEP_COUNT = 5

type PopoverPosition = {
    bottom: number
    right: number
    maxHeight: number
}

const POPOVER_VARIANTS: Variants = {
    initial: { opacity: 0, scale: 0.94, y: 6 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.16, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        scale: 0.96,
        y: 4,
        transition: { duration: 0.12, ease: MOTION_EASE_EMPHASIZED },
    },
}

const TRIGGER_VARIANTS: Variants = {
    initial: { opacity: 0, scale: 0.92, y: 4 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.22, ease: MOTION_EASE_EMPHASIZED },
    },
    exit: {
        opacity: 0,
        scale: 0.92,
        y: 4,
        transition: { duration: 0.16, ease: MOTION_EASE_EMPHASIZED },
    },
}

const ITEM_VARIANTS: Variants = {
    initial: { opacity: 0, y: 4 },
    animate: (index: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.18, ease: MOTION_EASE_EMPHASIZED, delay: Math.min(index, 6) * 0.015 },
    }),
}

function readViewportRect(): { width: number; height: number } {
    if (typeof window === 'undefined') {
        return { width: 0, height: 0 }
    }
    const visual = window.visualViewport
    if (visual) {
        return { width: visual.width, height: visual.height + visual.offsetTop }
    }
    return { width: window.innerWidth, height: window.innerHeight }
}

function computePopoverPosition(trigger: HTMLElement): PopoverPosition {
    const rect = trigger.getBoundingClientRect()
    const viewport = readViewportRect()
    const right = Math.max(VIEWPORT_PADDING_PX, viewport.width - rect.right)
    const availableUp = rect.top - POPOVER_GAP_PX - VIEWPORT_PADDING_PX
    return {
        bottom: Math.max(VIEWPORT_PADDING_PX, viewport.height - rect.top + POPOVER_GAP_PX),
        right,
        maxHeight: Math.max(180, availableUp),
    }
}

export function ConversationOutline(props: ConversationOutlineProps): React.JSX.Element | null {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<PopoverPosition | null>(null)
    const [visibleCount, setVisibleCount] = useState(OUTLINE_INITIAL_VISIBLE_COUNT)
    const { hasMoreHistory, isLoadingHistory, isPreparingHistory, onRequestMoreHistory } = props
    const hasOutlineContent = props.items.length > 0 || hasMoreHistory
    useEffect(() => {
        setVisibleCount(OUTLINE_INITIAL_VISIBLE_COUNT)
        setOpen(false)
    }, [props.sessionId])
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const popoverRef = useRef<HTMLDivElement | null>(null)

    const updatePosition = useCallback(() => {
        if (!triggerRef.current) {
            return
        }
        setPosition(computePopoverPosition(triggerRef.current))
    }, [])

    useEffect(() => {
        if (!open) {
            return
        }
        if (!hasOutlineContent) {
            setOpen(false)
            return
        }
        updatePosition()
        const handleReflow = () => updatePosition()
        window.addEventListener('resize', handleReflow)
        window.addEventListener('scroll', handleReflow, true)
        window.visualViewport?.addEventListener('resize', handleReflow)
        window.visualViewport?.addEventListener('scroll', handleReflow)
        return () => {
            window.removeEventListener('resize', handleReflow)
            window.removeEventListener('scroll', handleReflow, true)
            window.visualViewport?.removeEventListener('resize', handleReflow)
            window.visualViewport?.removeEventListener('scroll', handleReflow)
        }
    }, [hasOutlineContent, open, updatePosition])

    useEffect(() => {
        if (!open) {
            return
        }
        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Node
            if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) {
                return
            }
            setOpen(false)
        }
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
            }
        }
        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    const handleJump = useCallback(
        (conversationId: string) => {
            if (props.onJump(conversationId)) {
                setOpen(false)
            }
        },
        [props.onJump]
    )

    if (!hasOutlineContent && !isPreparingHistory) {
        return null
    }

    const visibleStart = Math.max(0, props.items.length - visibleCount)
    const visibleItems = props.items.slice(visibleStart)
    const hiddenLoadedCount = visibleStart
    const showEarlierCount = Math.max(hiddenLoadedCount, OUTLINE_REVEAL_STEP_COUNT)
    const canShowEarlier = hiddenLoadedCount > 0 || hasMoreHistory
    const handleShowEarlier = () => {
        if (hiddenLoadedCount > 0) {
            setVisibleCount((current) => current + OUTLINE_REVEAL_STEP_COUNT)
            return
        }
        if (!isLoadingHistory) {
            setVisibleCount((current) => current + OUTLINE_REVEAL_STEP_COUNT)
            onRequestMoreHistory()
        }
    }

    return (
        <>
            <m.div
                className="ds-thread-outline-trigger-wrapper"
                variants={TRIGGER_VARIANTS}
                initial="initial"
                animate="animate"
                exit="exit"
            >
                <Button
                    ref={triggerRef}
                    type="button"
                    size="iconSm"
                    variant="secondary"
                    data-testid={THREAD_OUTLINE_TRIGGER_TEST_ID}
                    className={`ds-thread-outline-trigger ${ICON_ONLY_BUTTON_NEUTRAL_SURFACE_CLASS_NAME}`}
                    aria-expanded={hasOutlineContent && open}
                    aria-haspopup="dialog"
                    aria-busy={isPreparingHistory || undefined}
                    aria-label={t('conversationOutline.toggle')}
                    title={t('conversationOutline.toggle')}
                    disabled={!hasOutlineContent}
                    onClick={() => setOpen((current) => !current)}
                >
                    <ConversationIcon className="h-4.5 w-4.5" />
                </Button>
            </m.div>
            {typeof document !== 'undefined'
                ? createPortal(
                      <AnimatePresence>
                          {hasOutlineContent && open ? (
                              <m.div
                                  key="outline-popover"
                                  ref={popoverRef}
                                  data-testid={THREAD_OUTLINE_POPOVER_TEST_ID}
                                  role="dialog"
                                  aria-label={t('conversationOutline.title')}
                                  className="ds-thread-outline-popover"
                                  style={{
                                      bottom: position?.bottom ?? 0,
                                      right: position?.right ?? 0,
                                      width: POPOVER_WIDTH_PX,
                                      maxWidth: 'calc(100vw - 1rem)',
                                      maxHeight: position?.maxHeight ?? 320,
                                      visibility: position ? 'visible' : 'hidden',
                                  }}
                                  variants={POPOVER_VARIANTS}
                                  initial="initial"
                                  animate="animate"
                                  exit="exit"
                              >
                                  <div className="ds-thread-outline-popover-header">
                                      <span className="ds-thread-outline-popover-header-title">
                                          {t('conversationOutline.title')}
                                      </span>
                                      <span className="ds-thread-outline-popover-header-count">
                                          {props.items.length}
                                      </span>
                                  </div>
                                  <div className="ds-thread-outline-popover-list">
                                      {canShowEarlier ? (
                                          <Button
                                              type="button"
                                              variant="ghost"
                                              pressStyle="list-row"
                                              className="ds-thread-outline-popover-reveal-earlier"
                                              disabled={isLoadingHistory}
                                              onClick={handleShowEarlier}
                                          >
                                              ... {t('conversationOutline.showEarlier', { n: showEarlierCount })}
                                          </Button>
                                      ) : null}
                                      {visibleItems.map((item, sliceIndex) => {
                                          const realIndex = visibleStart + sliceIndex
                                          return (
                                              <m.button
                                                  key={item.conversationId}
                                                  type="button"
                                                  data-testid={THREAD_OUTLINE_ITEM_TEST_ID}
                                                  data-conversation-id={item.conversationId}
                                                  className="ds-thread-outline-popover-item"
                                                  custom={sliceIndex}
                                                  variants={ITEM_VARIANTS}
                                                  initial="initial"
                                                  animate="animate"
                                                  onClick={() => handleJump(item.conversationId)}
                                              >
                                                  <span className="ds-thread-outline-popover-item-index">
                                                      {realIndex + 1}
                                                  </span>
                                                  <span className="ds-thread-outline-popover-item-title">
                                                      {item.title}
                                                  </span>
                                              </m.button>
                                          )
                                      })}
                                      {hasMoreHistory && isLoadingHistory ? (
                                          <div
                                              className="ds-thread-outline-popover-loading"
                                              role="status"
                                              aria-live="polite"
                                          >
                                              {t('conversationOutline.loadingEarlier')}
                                          </div>
                                      ) : null}
                                  </div>
                              </m.div>
                          ) : null}
                      </AnimatePresence>,
                      document.body
                  )
                : null}
        </>
    )
}
