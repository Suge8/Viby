import { describe, expect, it, vi } from 'vitest'
import { createRandomId, createScopedId } from '@/lib/id'

describe('id helpers', () => {
    it('uses crypto.randomUUID when available', () => {
        const randomUUID = vi.fn(() => 'uuid-from-crypto')
        vi.stubGlobal('crypto', {
            randomUUID,
            getRandomValues: vi.fn()
        })

        expect(createRandomId()).toBe('uuid-from-crypto')
        expect(randomUUID).toHaveBeenCalledTimes(1)
    })

    it('falls back to uuid-like id generation when randomUUID is unavailable', () => {
        vi.stubGlobal('crypto', {
            getRandomValues: (values: Uint8Array) => {
                values.fill(0xab)
                return values
            }
        })

        expect(createRandomId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    it('creates scoped ids', () => {
        vi.stubGlobal('crypto', {
            randomUUID: () => 'scoped-uuid',
            getRandomValues: vi.fn()
        })

        expect(createScopedId('message')).toBe('message-scoped-uuid')
    })
})
