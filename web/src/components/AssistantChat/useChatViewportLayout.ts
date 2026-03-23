import { useEffect, useState } from 'react'
import { useStandaloneDisplayMode } from '@/hooks/useStandaloneDisplayMode'
import { TRANSIENT_EDITABLE_ATTRIBUTE } from '@/lib/domAttributes'

type VisualViewportLike = Pick<VisualViewport, 'height' | 'offsetTop'>
const APP_SAFE_AREA_INSET_BOTTOM_CSS_VARIABLE = '--app-safe-area-inset-bottom'
const PORTRAIT_ORIENTATION_KEY = 'portrait'
const LANDSCAPE_ORIENTATION_KEY = 'landscape'

export type ChatViewportLayout = {
    isStandalone: boolean
    isKeyboardOpen: boolean
    bottomInsetPx: number
}

type ChatViewportState = ChatViewportLayout & {
    stableViewportHeightPx: number
    orientationKey: string
}

function areChatViewportStatesEqual(
    previousState: ChatViewportState | null,
    nextState: ChatViewportState
): boolean {
    if (!previousState) {
        return false
    }

    return (
        previousState.isStandalone === nextState.isStandalone
        && previousState.isKeyboardOpen === nextState.isKeyboardOpen
        && previousState.bottomInsetPx === nextState.bottomInsetPx
        && previousState.stableViewportHeightPx === nextState.stableViewportHeightPx
        && previousState.orientationKey === nextState.orientationKey
    )
}

function getVisibleViewportBottom(
    layoutViewportHeight: number,
    visualViewport: VisualViewportLike | null
): number {
    if (!visualViewport) {
        return layoutViewportHeight
    }

    const visibleViewportBottom = visualViewport.height + visualViewport.offsetTop
    return Math.round(Math.min(layoutViewportHeight, visibleViewportBottom))
}

function getSafeAreaCompensation(options: {
    rawBottomInsetPx: number
    safeAreaInsetBottomPx: number
}): number {
    const { rawBottomInsetPx, safeAreaInsetBottomPx } = options
    if (rawBottomInsetPx <= safeAreaInsetBottomPx) {
        return 0
    }

    return safeAreaInsetBottomPx
}

function readSafeAreaInsetBottom(): number {
    if (typeof window === 'undefined') {
        return 0
    }

    const value = getComputedStyle(document.documentElement)
        .getPropertyValue(APP_SAFE_AREA_INSET_BOTTOM_CSS_VARIABLE)
        .trim()
    const safeAreaInsetBottomPx = Number.parseFloat(value)
    if (!Number.isFinite(safeAreaInsetBottomPx)) {
        return 0
    }

    return Math.max(0, Math.round(safeAreaInsetBottomPx))
}

function readViewportOrientationKey(): string {
    if (typeof window === 'undefined') {
        return PORTRAIT_ORIENTATION_KEY
    }

    return window.innerWidth > window.innerHeight
        ? LANDSCAPE_ORIENTATION_KEY
        : PORTRAIT_ORIENTATION_KEY
}

function isEditableElement(element: Element | null): boolean {
    if (!(element instanceof HTMLElement)) {
        return false
    }

    if (element.hasAttribute(TRANSIENT_EDITABLE_ATTRIBUTE)) {
        return false
    }

    if (element.isContentEditable) {
        return true
    }

    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
}

function readEditableFocusActive(): boolean {
    if (typeof document === 'undefined') {
        return false
    }

    return isEditableElement(document.activeElement)
}

export function getChatViewportMetrics(
    layoutViewportHeight: number,
    visualViewport: VisualViewportLike | null,
    safeAreaInsetBottomPx = 0
): Pick<ChatViewportLayout, 'isKeyboardOpen' | 'bottomInsetPx'> {
    const visibleViewportBottom = getVisibleViewportBottom(layoutViewportHeight, visualViewport)
    const rawBottomInsetPx = Math.max(0, layoutViewportHeight - visibleViewportBottom)
    const safeAreaCompensationPx = getSafeAreaCompensation({
        rawBottomInsetPx,
        safeAreaInsetBottomPx
    })
    const bottomInsetPx = Math.max(0, rawBottomInsetPx - safeAreaCompensationPx)

    return {
        isKeyboardOpen: bottomInsetPx > 0,
        bottomInsetPx
    }
}

export function getNextChatViewportState(options: {
    layoutViewportHeight: number
    visualViewport: VisualViewportLike | null
    safeAreaInsetBottomPx: number
    editableFocusActive: boolean
    isStandalone: boolean
    previousState: ChatViewportState | null
    orientationKey: string
}): ChatViewportState {
    const {
        layoutViewportHeight,
        visualViewport,
        safeAreaInsetBottomPx,
        editableFocusActive,
        isStandalone,
        previousState,
        orientationKey
    } = options
    const previousOrientationKey = previousState?.orientationKey ?? orientationKey
    const stableViewportHeightPx = previousOrientationKey === orientationKey
        ? Math.min(previousState?.stableViewportHeightPx ?? layoutViewportHeight, layoutViewportHeight)
        : layoutViewportHeight

    if (!editableFocusActive) {
        return {
            isStandalone,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            stableViewportHeightPx,
            orientationKey
        }
    }

    const metrics = getChatViewportMetrics(
        stableViewportHeightPx,
        visualViewport,
        safeAreaInsetBottomPx
    )

    return {
        isStandalone,
        ...metrics,
        stableViewportHeightPx,
        orientationKey
    }
}

function readChatViewportState(
    isStandalone: boolean,
    previousState: ChatViewportState | null
): ChatViewportState {
    if (typeof window === 'undefined') {
        return {
            isStandalone,
            isKeyboardOpen: false,
            bottomInsetPx: 0,
            stableViewportHeightPx: 0,
            orientationKey: PORTRAIT_ORIENTATION_KEY
        }
    }

    return getNextChatViewportState({
        layoutViewportHeight: window.innerHeight,
        visualViewport: window.visualViewport,
        safeAreaInsetBottomPx: readSafeAreaInsetBottom(),
        editableFocusActive: readEditableFocusActive(),
        isStandalone,
        previousState,
        orientationKey: readViewportOrientationKey()
    })
}

export function useChatViewportLayout(): ChatViewportLayout {
    const isStandalone = useStandaloneDisplayMode()
    const [state, setState] = useState<ChatViewportState>(() => readChatViewportState(isStandalone, null))

    useEffect(() => {
        if (typeof window === 'undefined') {
            return
        }

        function syncLayout(): void {
            setState((previousState) => {
                const nextState = readChatViewportState(isStandalone, previousState)
                if (areChatViewportStatesEqual(previousState, nextState)) {
                    return previousState
                }

                return nextState
            })
        }

        syncLayout()

        const visualViewport = window.visualViewport
        document.addEventListener('focusin', syncLayout, true)
        document.addEventListener('focusout', syncLayout, true)
        window.addEventListener('resize', syncLayout)
        window.addEventListener('orientationchange', syncLayout)
        visualViewport?.addEventListener('resize', syncLayout)
        visualViewport?.addEventListener('scroll', syncLayout)

        return () => {
            document.removeEventListener('focusin', syncLayout, true)
            document.removeEventListener('focusout', syncLayout, true)
            window.removeEventListener('resize', syncLayout)
            window.removeEventListener('orientationchange', syncLayout)
            visualViewport?.removeEventListener('resize', syncLayout)
            visualViewport?.removeEventListener('scroll', syncLayout)
        }
    }, [isStandalone])

    return {
        isStandalone: state.isStandalone,
        isKeyboardOpen: state.isKeyboardOpen,
        bottomInsetPx: state.bottomInsetPx
    }
}
