import { describe, expect, it } from 'vitest'
import { resolveLaunchPermissionMode } from './launchConfig'

describe('resolveLaunchPermissionMode', () => {
    it('keeps default mode when yolo is disabled', () => {
        expect(resolveLaunchPermissionMode('claude', false)).toBe('default')
        expect(resolveLaunchPermissionMode('codex', false)).toBe('default')
    })

    it('maps Claude yolo to bypassPermissions', () => {
        expect(resolveLaunchPermissionMode('claude', true)).toBe('bypassPermissions')
    })

    it('keeps yolo for non-Claude agents', () => {
        expect(resolveLaunchPermissionMode('codex', true)).toBe('yolo')
        expect(resolveLaunchPermissionMode('cursor', true)).toBe('yolo')
        expect(resolveLaunchPermissionMode('gemini', true)).toBe('yolo')
        expect(resolveLaunchPermissionMode('opencode', true)).toBe('yolo')
        expect(resolveLaunchPermissionMode('pi', true)).toBe('yolo')
    })
})
