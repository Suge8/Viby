import { SESSION_CHAT_HEADER_STAGE_SELECTOR } from '@/lib/sessionUiContracts'

function readCssLengthPx(scope: HTMLElement, rawValue: string): number {
    const value = rawValue.trim()
    if (value.length === 0) {
        return 0
    }

    const probe = document.createElement('div')
    probe.style.position = 'absolute'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.marginTop = value
    scope.appendChild(probe)
    const px = Math.round(Number.parseFloat(getComputedStyle(probe).marginTop) || 0)
    probe.remove()
    return px
}

function resolveTranscriptAnchorScope(viewport: HTMLElement): HTMLElement | null {
    if (!(viewport instanceof HTMLElement)) {
        return null
    }

    const page = typeof viewport.closest === 'function' ? viewport.closest('.session-chat-page') : null
    return page instanceof HTMLElement ? page : viewport
}

function readSpacerHeightPx(viewport: HTMLElement): number {
    if (typeof viewport.querySelector !== 'function') {
        return 0
    }
    const spacer = viewport.querySelector('.ds-thread-top-anchor-spacer')
    if (!(spacer instanceof HTMLElement)) {
        return 0
    }
    return Math.round(spacer.offsetHeight)
}

function readVisualClearancePx(scope: HTMLElement | null): number {
    const styles = getComputedStyle(scope ?? document.documentElement)
    const rawValue = styles.getPropertyValue('--chat-header-visual-clearance')
    if (!(scope instanceof HTMLElement)) {
        return Math.round(Number.parseFloat(rawValue) || 0)
    }

    return readCssLengthPx(scope, rawValue)
}

function readMeasuredHeaderAnchorSpacePx(viewport: HTMLElement): number {
    const header = document.querySelector(SESSION_CHAT_HEADER_STAGE_SELECTOR)
    if (!(header instanceof HTMLElement)) {
        return 0
    }
    const scope = resolveTranscriptAnchorScope(viewport)
    const visualClearance = readVisualClearancePx(scope)
    const viewportTop = viewport.getBoundingClientRect().top
    const headerBottom = header.getBoundingClientRect().bottom
    return Math.max(0, Math.round(headerBottom - viewportTop + visualClearance))
}

// Programmatic top-anchor uses real viewport/header geometry because the
// floating header can be visually offset by motion or mobile viewport chrome.
// The spacer stays as fallback for tests and degenerate mocks.
export function readTranscriptTopAnchorSpacePx(viewport: HTMLElement): number {
    const measuredHeaderAnchor = readMeasuredHeaderAnchorSpacePx(viewport)
    if (measuredHeaderAnchor > 0) {
        return measuredHeaderAnchor
    }
    const measured = readSpacerHeightPx(viewport)
    if (measured > 0) {
        return measured
    }
    const scope = resolveTranscriptAnchorScope(viewport)
    const styles = getComputedStyle(scope ?? document.documentElement)
    const rawValue = styles.getPropertyValue('--chat-header-anchor-space')
    if (!(scope instanceof HTMLElement)) {
        return Math.round(Number.parseFloat(rawValue) || 0)
    }

    return readCssLengthPx(scope, rawValue)
}

export function readTranscriptTopAnchorLinePx(viewport: HTMLElement): number {
    return Math.round(viewport.getBoundingClientRect().top + readTranscriptTopAnchorSpacePx(viewport))
}
