import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useClaudeComposerModelShortcut } from './useClaudeComposerModelShortcut'

const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

afterEach(() => {
    addEventListenerSpy.mockClear()
    removeEventListenerSpy.mockClear()
})

describe('useClaudeComposerModelShortcut', () => {
    it('does not attach a global shortcut listener for non-Claude sessions', () => {
        renderHook(() => useClaudeComposerModelShortcut({
            agentFlavor: 'codex',
            model: 'gpt-5.4',
            onModelChange: vi.fn(),
            haptic: vi.fn()
        }))

        expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function))
    })
})
