import { describe, expect, it } from 'vitest'
import { buildSessionChatLayoutCssVars } from '@/components/sessionChatLayoutStyle'

describe('buildSessionChatLayoutCssVars', () => {
    it('always returns the full schema so the workspace effect can use the same object for write and cleanup', () => {
        const vars = buildSessionChatLayoutCssVars({
            composerFrame: { top: 420, left: 100, width: 600, height: 64 },
            composerHeight: 64,
            bottomInsetPx: 0,
        })

        expect(Object.keys(vars).sort()).toEqual([
            '--chat-composer-offset-bottom',
            '--chat-composer-reserved-space',
            '--chat-composer-stage-top',
            '--chat-desktop-stage-center-x',
        ])
        expect(vars['--chat-composer-offset-bottom']).toBe('0px')
        expect(vars['--chat-composer-reserved-space']).toBe('64px')
        expect(vars['--chat-composer-stage-top']).toBe('420px')
        // 100 + 600/2 = 400
        expect(vars['--chat-desktop-stage-center-x']).toBe('400px')
    })

    it('falls back to the :root defaults when the composer frame is missing so :root resolution stays consistent across mount transitions', () => {
        const vars = buildSessionChatLayoutCssVars({
            composerFrame: null,
            composerHeight: 0,
            bottomInsetPx: 0,
        })

        // Defaults mirror design-system-composer.css :root declarations.
        expect(vars['--chat-composer-stage-top']).toBe('100vh')
        expect(vars['--chat-desktop-stage-center-x']).toBe('50vw')
    })

    it('clamps negative composer heights to zero so the badge anchor cannot fold under the safe area', () => {
        const vars = buildSessionChatLayoutCssVars({
            composerFrame: null,
            composerHeight: -42,
            bottomInsetPx: 0,
        })

        expect(vars['--chat-composer-reserved-space']).toBe('0px')
    })
})
