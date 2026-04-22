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

export function readTranscriptTopAnchorSpacePx(viewport: HTMLElement): number {
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
