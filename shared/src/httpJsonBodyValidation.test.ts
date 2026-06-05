import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateJsonBody } from './httpJsonBodyValidation'

describe('validateJsonBody', () => {
    const schema = z.object({ name: z.string().min(1) })

    it('returns typed data for valid JSON body values', () => {
        expect(validateJsonBody({ name: 'viby' }, schema)).toEqual({ ok: true, data: { name: 'viby' } })
    })

    it('returns the route error message for invalid body values', () => {
        expect(validateJsonBody({}, schema, 'Invalid create body')).toEqual({
            ok: false,
            error: 'Invalid create body',
        })
    })
})
