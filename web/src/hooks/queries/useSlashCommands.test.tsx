import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useSlashCommands } from './useSlashCommands'

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

describe('useSlashCommands', () => {
    it('does not fetch slash commands until autocomplete is actually requested', async () => {
        const queryClient = createQueryClient()
        const api = {
            getSlashCommands: vi.fn(async () => ({
                success: true,
                commands: [{ name: 'custom', source: 'user', description: 'Custom command' }]
            }))
        }

        const { result } = renderHook(
            () => useSlashCommands(api as never, 'session-1', 'codex'),
            { wrapper: createWrapper(queryClient) }
        )

        expect(api.getSlashCommands).not.toHaveBeenCalled()

        const initialSuggestions = await result.current.getSuggestions('/')

        expect(initialSuggestions.some((item) => item.text === '/review')).toBe(true)
        await waitFor(() => {
            expect(api.getSlashCommands).toHaveBeenCalledTimes(1)
        })
    })
})
