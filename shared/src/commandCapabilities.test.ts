import { describe, expect, it } from 'bun:test'
import {
    extractLeadingCommandTrigger,
    isHiddenCommandCapabilityTrigger,
    resolveCommandCapabilityActionType,
    resolveCommandSessionEffect,
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

    it('extracts compound triggers before falling back to the first slash command', () => {
        expect(extractLeadingCommandTrigger(' /chat resume latest')).toBe('/chat resume')
        expect(extractLeadingCommandTrigger('/commands reload')).toBe('/commands reload')
        expect(extractLeadingCommandTrigger('/clear now')).toBe('/clear')
        expect(extractLeadingCommandTrigger('plain text')).toBeNull()
    })

    it('keeps provider lifecycle effects in the shared owner', () => {
        expect(resolveCommandSessionEffect('claude', '/resume')).toBe('switches_session')
        expect(resolveCommandSessionEffect('codex', '/rewind')).toBe('replays_history')
        expect(resolveCommandSessionEffect('gemini', '/chat resume')).toBe('replays_history')
        expect(resolveCommandSessionEffect('pi', '/resume')).toBe('none')
    })
})
