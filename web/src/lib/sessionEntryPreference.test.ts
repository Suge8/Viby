import { describe, expect, it } from 'vitest'
import {
    readLastOpenedSessionId,
    writeLastOpenedSessionId
} from '@/lib/sessionEntryPreference'

describe('sessionEntryPreference', () => {
    it('reads back the last opened session id from browser storage', () => {
        writeLastOpenedSessionId('session-42')

        expect(readLastOpenedSessionId()).toBe('session-42')
    })
})
