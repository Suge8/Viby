import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'

export type ThreadAnchorElement = {
    id: string
    element: HTMLElement
}

function getThreadAnchorId(element: HTMLElement): string | null {
    return element.getAttribute(THREAD_MESSAGE_ID_ATTRIBUTE)
}

function hasNestedThreadAnchor(element: HTMLElement): boolean {
    return element.querySelector(`[${THREAD_MESSAGE_ID_ATTRIBUTE}]`) !== null
}

function collectThreadAnchorCandidates(viewport: HTMLDivElement): ReadonlyMap<string, readonly HTMLElement[]> {
    const candidatesById = new Map<string, HTMLElement[]>()
    const elements = viewport.querySelectorAll<HTMLElement>(`[${THREAD_MESSAGE_ID_ATTRIBUTE}]`)

    for (const element of elements) {
        const id = getThreadAnchorId(element)
        if (!id) {
            continue
        }

        const existing = candidatesById.get(id)
        if (existing) {
            existing.push(element)
            continue
        }

        candidatesById.set(id, [element])
    }

    return candidatesById
}

function pickPreferredThreadAnchorElement(candidates: readonly HTMLElement[] | undefined): HTMLElement | null {
    if (!candidates || candidates.length === 0) {
        return null
    }

    for (const candidate of candidates) {
        if (!hasNestedThreadAnchor(candidate)) {
            return candidate
        }
    }

    return candidates.at(-1) ?? null
}

export function findThreadAnchorElement(
    viewport: HTMLDivElement,
    orderedMessageIds: readonly string[],
    messageId: string
): HTMLElement | null {
    if (!orderedMessageIds.includes(messageId)) {
        return null
    }

    const candidatesById = collectThreadAnchorCandidates(viewport)
    return pickPreferredThreadAnchorElement(candidatesById.get(messageId))
}

export function getOrderedThreadAnchorElements(
    viewport: HTMLDivElement,
    orderedMessageIds: readonly string[]
): ThreadAnchorElement[] {
    const candidatesById = collectThreadAnchorCandidates(viewport)
    const anchors: ThreadAnchorElement[] = []

    for (const id of orderedMessageIds) {
        const element = pickPreferredThreadAnchorElement(candidatesById.get(id))
        if (!element) {
            continue
        }

        anchors.push({ id, element })
    }

    return anchors
}

export function getCurrentTopThreadAnchorId(options: {
    viewport: HTMLDivElement
    orderedMessageIds: readonly string[]
    viewportTopEdgePx: number
}): string | null {
    const anchors = getOrderedThreadAnchorElements(options.viewport, options.orderedMessageIds)
    let currentTopAnchorId: string | null = null

    for (const anchor of anchors) {
        const rect = anchor.element.getBoundingClientRect()
        if (rect.bottom <= options.viewportTopEdgePx) {
            continue
        }

        if (rect.top <= options.viewportTopEdgePx) {
            currentTopAnchorId = anchor.id
            continue
        }

        return currentTopAnchorId ?? anchor.id
    }

    if (currentTopAnchorId) {
        return currentTopAnchorId
    }

    return anchors.at(-1)?.id ?? null
}
