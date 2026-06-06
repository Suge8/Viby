import { describe, expect, it } from 'vitest'
import type { ModelReasoningEffortSelection } from './types'

describe('NewSession types', () => {
    it('uses null to mean no submitted reasoning effort', () => {
        const value: ModelReasoningEffortSelection = null
        expect(value).toBeNull()
    })
})
