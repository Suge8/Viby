import { describe, expect, it } from 'bun:test'

import {
    buildUnexpectedChildExitOutcome,
    formatUnexpectedChildExitMessage,
} from './devRemoteSupervisor'

describe('devRemoteSupervisor', () => {
    it('forces a non-zero exit code when a child exits cleanly but unexpectedly', () => {
        expect(buildUnexpectedChildExitOutcome('hub', 'code=0, signal=none', 0)).toEqual({
            exitCode: 1,
            message: '[hub] exited (code=0, signal=none). Shutting down dev:remote so the supervisor can restart the full stack.'
        })
        expect(buildUnexpectedChildExitOutcome('web', 'code=null, signal=SIGKILL', null)).toEqual({
            exitCode: 1,
            message: '[web] exited (code=null, signal=SIGKILL). Shutting down dev:remote so the supervisor can restart the full stack.'
        })
    })

    it('preserves a non-zero child exit code for the parent process', () => {
        expect(buildUnexpectedChildExitOutcome('web', 'code=7, signal=none', 7)).toEqual({
            exitCode: 7,
            message: '[web] exited (code=7, signal=none). Shutting down dev:remote so the supervisor can restart the full stack.'
        })
    })

    it('formats the fail-fast supervisor message consistently', () => {
        expect(formatUnexpectedChildExitMessage('hub', 'code=null, signal=SIGKILL')).toBe(
            '[hub] exited (code=null, signal=SIGKILL). Shutting down dev:remote so the supervisor can restart the full stack.'
        )
    })
})
