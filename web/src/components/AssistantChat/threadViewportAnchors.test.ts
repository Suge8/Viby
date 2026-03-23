import { describe, expect, it } from 'vitest'
import { THREAD_MESSAGE_ID_ATTRIBUTE } from '@/components/AssistantChat/threadMessageIdentity'
import {
    findThreadAnchorElement,
    getCurrentTopThreadAnchorId,
} from '@/components/AssistantChat/threadViewportAnchors'

function setRect(element: HTMLElement, rect: {
    top: number
    bottom: number
    height: number
}): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: rect.top,
            top: rect.top,
            bottom: rect.bottom,
            left: 0,
            right: 320,
            width: 320,
            height: rect.height,
            toJSON: () => ({})
        })
    })
}

function createAnchor(id: string, rect: {
    top: number
    bottom: number
    height: number
}): HTMLDivElement {
    const element = document.createElement('div')
    element.setAttribute(THREAD_MESSAGE_ID_ATTRIBUTE, id)
    setRect(element, rect)
    return element
}

function createViewport(): HTMLDivElement {
    const viewport = document.createElement('div')
    Object.defineProperty(viewport, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 100,
            top: 100,
            bottom: 520,
            left: 0,
            right: 320,
            width: 320,
            height: 420,
            toJSON: () => ({})
        })
    })
    return viewport
}

describe('threadViewportAnchors', () => {
    it('prefers the leaf DOM anchor when the same message id is rendered twice', () => {
        const viewport = createViewport()
        const wrapper = createAnchor('tool:1', { top: -900, bottom: 900, height: 1800 })
        const leaf = createAnchor('tool:1', { top: 140, bottom: 206, height: 66 })
        wrapper.appendChild(leaf)
        viewport.appendChild(wrapper)

        const target = findThreadAnchorElement(viewport, ['tool:1'], 'tool:1')

        expect(target).toBe(leaf)
    })

    it('ignores duplicated wrapper anchors when resolving the current top anchor', () => {
        const viewport = createViewport()
        const wrapper = createAnchor('tool:1', { top: -900, bottom: 900, height: 1800 })
        const leaf = createAnchor('tool:1', { top: 40, bottom: 100, height: 60 })
        const user = createAnchor('user:2', { top: 120, bottom: 188, height: 68 })

        wrapper.appendChild(leaf)
        viewport.appendChild(wrapper)
        viewport.appendChild(user)

        const currentTopAnchorId = getCurrentTopThreadAnchorId({
            viewport,
            orderedMessageIds: ['tool:1', 'user:2'],
            viewportTopEdgePx: 128
        })

        expect(currentTopAnchorId).toBe('user:2')
    })
})
