import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ToolCallBlock } from '@/chat/types'
import { ToolCard } from '@/components/ToolCard/ToolCard'

vi.mock('@/components/ToolCard/knownTools', () => ({
    getToolPresentation: () => ({
        title: 'Terminal',
        subtitle: '/bin/zsh -lc "echo hi"',
        icon: null,
        minimal: true,
    }),
}))

vi.mock('@/components/ToolCard/lazyViews', () => ({
    getLazyToolViewComponent: () => null,
    getLazyToolResultViewComponent: () => null,
}))

vi.mock('@/hooks/usePointerFocusRing', () => ({
    usePointerFocusRing: () => ({
        suppressFocusRing: false,
        onTriggerPointerDown: vi.fn(),
        onTriggerKeyDown: vi.fn(),
        onTriggerBlur: vi.fn(),
    }),
}))

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}))

function createToolBlock(): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: 'tool-1',
        localId: null,
        createdAt: 1_000,
        children: [],
        tool: {
            id: 'tool-1',
            name: 'Terminal',
            state: 'completed',
            input: null,
            createdAt: 1_000,
            startedAt: 1_000,
            completedAt: 1_001,
            description: null,
            result: null,
        },
    }
}

describe('ToolCard', () => {
    it('keeps the header trigger on a lightweight semantic button instead of the animated ds-button shell', () => {
        render(
            <ToolCard
                api={{} as never}
                sessionId="session-1"
                metadata={null}
                disabled={false}
                onDone={() => {}}
                block={createToolBlock()}
            />
        )

        const trigger = screen.getByTestId('tool-card-trigger')
        expect(trigger.tagName).toBe('BUTTON')
        expect(trigger.className).not.toContain('ds-button')
        expect(trigger.className).toContain('ds-interactive-card-inherit-radius')
        expect(trigger.className).toContain('px-3')
        expect(trigger.className).toContain('py-3')
        expect(trigger.className).toContain('items-start')
        expect(trigger.className).toContain('justify-start')
    })

    it('uses the same transcript-family radius and non-floating surface contract as message bubbles', () => {
        const { container } = render(
            <ToolCard
                api={{} as never}
                sessionId="session-1"
                metadata={null}
                disabled={false}
                onDone={() => {}}
                block={createToolBlock()}
            />
        )

        const card = container.firstElementChild as HTMLElement
        expect(card.className).toContain('ds-tool-card-surface')
        expect(card.className).toContain('rounded-[var(--ds-radius-2xl)]')
        expect(card.className).toContain('shadow-none')
        expect(card.className).not.toContain('shadow-sm')
    })
})
