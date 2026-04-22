import { describe, expect, it } from 'vitest'
import { Stream } from './stream'

describe('claude sdk stream', () => {
    it('keeps terminal errors visible even if done is called afterwards', async () => {
        const stream = new Stream<number>()
        const error = new Error('boom')

        const pending = stream.next()
        stream.error(error)
        stream.done()

        await expect(pending).rejects.toBe(error)
        await expect(stream.next()).rejects.toBe(error)
    })
})
