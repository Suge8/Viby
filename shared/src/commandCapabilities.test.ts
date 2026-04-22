import { describe, expect, it } from 'bun:test'
import {
    isHiddenCommandCapabilityTrigger,
    resolveCommandCapabilityActionType,
    shouldInvalidateCommandCapabilitiesOnTrigger,
} from './commandCapabilities'

describe('commandCapabilities helpers', () => {
    it('maps lifecycle slash commands into shared product actions', () => {
        expect(resolveCommandCapabilityActionType('/clear')).toBe('open_new_session')
        expect(resolveCommandCapabilityActionType('/chat resume')).toBeUndefined()
        expect(resolveCommandCapabilityActionType('/status')).toBeUndefined()
    })

    it('marks provider-native resume triggers as hidden product commands', () => {
        expect(isHiddenCommandCapabilityTrigger('/resume')).toBe(true)
        expect(isHiddenCommandCapabilityTrigger('/chat resume')).toBe(true)
        expect(isHiddenCommandCapabilityTrigger('/new')).toBe(false)
    })

    it('marks provider reload commands that should invalidate capability snapshots', () => {
        expect(shouldInvalidateCommandCapabilitiesOnTrigger('gemini', '/commands reload')).toBe(true)
        expect(shouldInvalidateCommandCapabilitiesOnTrigger('gemini', '/skills reload')).toBe(true)
        expect(shouldInvalidateCommandCapabilitiesOnTrigger('codex', '/new')).toBe(false)
    })
})
