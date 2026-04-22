import { describe, expect, it } from 'vitest'
import { getAvailableSessionActionIds, isConfirmableSessionActionId } from './sessionActionAvailability'

describe('sessionActionAvailability', () => {
    it('keeps running sessions on stop and rename only', () => {
        expect(
            getAvailableSessionActionIds({
                lifecycleState: 'running',
            })
        ).toEqual(['stop', 'rename'])
    })

    it('keeps resumable history sessions on rename and delete only', () => {
        expect(
            getAvailableSessionActionIds({
                lifecycleState: 'closed',
            })
        ).toEqual(['rename', 'delete'])
    })

    it('keeps readonly history sessions on rename and delete only', () => {
        expect(
            getAvailableSessionActionIds({
                lifecycleState: 'archived',
            })
        ).toEqual(['rename', 'delete'])
    })

    it('marks stop and delete as confirmable actions', () => {
        expect(isConfirmableSessionActionId('stop')).toBe(true)
        expect(isConfirmableSessionActionId('delete')).toBe(true)
        expect(isConfirmableSessionActionId('rename')).toBe(false)
    })
})
