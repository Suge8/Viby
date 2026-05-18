// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { RuntimeAgentConfigResponse } from '@/types/api'
import { useSaveAgentConfig } from './useSaveAgentConfig'

const version = {
    status: 'supported' as const,
    supportedVersion: '0.130.0',
    source: 'test',
    installedVersion: '0.130.0',
    checkedAt: 1,
}

function createQueryClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function createWrapper(queryClient: QueryClient): (props: PropsWithChildren) => React.JSX.Element {
    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
    }
}

describe('useSaveAgentConfig', () => {
    it('saves through the API and replaces only the matching cached agent', async () => {
        const queryClient = createQueryClient()
        queryClient.setQueryData<RuntimeAgentConfigResponse>(queryKeys.agentConfig, {
            agents: [
                { driver: 'codex', path: '/old', exists: true, values: { 'codex.model': 'old' }, version },
                { driver: 'claude', path: '/claude', exists: true, values: { 'claude.model': 'sonnet' }, version },
            ],
        })
        const onSaved = vi.fn()
        const api = {
            saveAgentConfig: vi.fn(async () => ({
                agent: {
                    driver: 'codex' as const,
                    path: '/new',
                    exists: true,
                    values: { 'codex.model': 'gpt-5.5' },
                    version,
                },
            })),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSaveAgentConfig(api, { onSaved }), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await result.current.mutateAsync({ driver: 'codex', values: { 'codex.model': 'gpt-5.5' } })
        })

        expect(api.saveAgentConfig).toHaveBeenCalledWith({ driver: 'codex', values: { 'codex.model': 'gpt-5.5' } })
        expect(onSaved).toHaveBeenCalledWith({
            agent: { driver: 'codex', path: '/new', exists: true, values: { 'codex.model': 'gpt-5.5' }, version },
        })
        expect(queryClient.getQueryData<RuntimeAgentConfigResponse>(queryKeys.agentConfig)?.agents).toEqual([
            { driver: 'claude', path: '/claude', exists: true, values: { 'claude.model': 'sonnet' }, version },
            { driver: 'codex', path: '/new', exists: true, values: { 'codex.model': 'gpt-5.5' }, version },
        ])
    })

    it('normalizes thrown non-Error values for the page toast owner', async () => {
        const queryClient = createQueryClient()
        const onError = vi.fn()
        const api = {
            saveAgentConfig: vi.fn(async () => {
                throw 'failed-save'
            }),
        } as Partial<ApiClient> as ApiClient

        const { result } = renderHook(() => useSaveAgentConfig(api, { onError }), {
            wrapper: createWrapper(queryClient),
        })

        await act(async () => {
            await expect(result.current.mutateAsync({ driver: 'claude', values: {} })).rejects.toBe('failed-save')
        })

        await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)))
        expect(onError.mock.calls[0]?.[0].message).toBe('failed-save')
    })
})
