import { LOCAL_SESSION_RECOVERY_DRIVERS } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import { RECOVER_LOCAL_DRIVERS } from './newSessionModes'

describe('newSessionModes', () => {
    it('uses the shared provider-backed recover-local driver contract', () => {
        expect(RECOVER_LOCAL_DRIVERS).toBe(LOCAL_SESSION_RECOVERY_DRIVERS)
        expect(RECOVER_LOCAL_DRIVERS).toEqual(['claude', 'codex', 'copilot', 'gemini', 'opencode', 'pi'])
    })
})
