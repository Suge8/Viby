import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useSkills } from './useSkills'

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <QueryClientProvider client={queryClient}>
                {props.children}
            </QueryClientProvider>
        )
    }
}

function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            }
        }
    })
}

describe('useSkills', () => {
    it('does not fetch skills until skill autocomplete is actually requested', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSkills: vi.fn(async () => ({
                success: true,
                skills: [{ name: 'build', description: 'Build skill' }]
            }))
        }

        const { result } = renderHook(
            () => useSkills(api as never, 'session-1'),
            { wrapper: createWrapper(queryClient) }
        )

        expect(api.getSkills).not.toHaveBeenCalled()

        const initialSuggestions = await result.current.getSuggestions('$')

        expect(initialSuggestions).toEqual([])
        await waitFor(() => {
            expect(api.getSkills).toHaveBeenCalledTimes(1)
        })
    })
})
