import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActiveSuggestions } from '@/hooks/useActiveSuggestions'

describe('useActiveSuggestions', () => {
    it('reruns the active query when the refresh key changes', async () => {
        const handler = vi.fn(async (query: string) => [
            {
                key: query,
                text: query,
                label: query,
            },
        ])

        const { result, rerender } = renderHook(
            ({ query, refreshKey }: { query: string; refreshKey: number }) =>
                useActiveSuggestions(query, handler, {
                    refreshKey,
                }),
            {
                initialProps: {
                    query: '/',
                    refreshKey: 0,
                },
            }
        )

        await waitFor(() => {
            expect(handler).toHaveBeenCalledTimes(1)
            expect(result.current[0]).toEqual([
                {
                    key: '/',
                    text: '/',
                    label: '/',
                },
            ])
        })

        rerender({
            query: '/',
            refreshKey: 1,
        })

        await waitFor(() => {
            expect(handler).toHaveBeenCalledTimes(2)
        })
    })
})
