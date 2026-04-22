import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { I18nProvider } from '@/lib/i18n-context'
import { TEST_RUNTIME_HOME_PATH, TEST_RUNTIME_PROJECT_PATH, TEST_RUNTIME_PROJECTS_PATH } from '@/test/sessionFactories'
import { useRuntimeDirectoryBrowser } from './useRuntimeDirectoryBrowser'

function createWrapper(): (props: PropsWithChildren) => React.JSX.Element {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    })

    return function Wrapper(props: PropsWithChildren): React.JSX.Element {
        return (
            <I18nProvider>
                <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
            </I18nProvider>
        )
    }
}

describe('useRuntimeDirectoryBrowser', () => {
    it('loads the current directory and common roots for the local runtime', async () => {
        const api = {
            browseRuntimeDirectory: vi.fn().mockResolvedValue({
                success: true,
                currentPath: TEST_RUNTIME_PROJECTS_PATH,
                parentPath: TEST_RUNTIME_HOME_PATH,
                entries: [{ name: 'viby', path: TEST_RUNTIME_PROJECT_PATH, type: 'directory' }],
                roots: [{ kind: 'home', path: TEST_RUNTIME_HOME_PATH }],
            }),
        } as unknown as ApiClient

        const { result } = renderHook(
            () =>
                useRuntimeDirectoryBrowser({
                    api,
                    initialPath: TEST_RUNTIME_PROJECTS_PATH,
                    enabled: true,
                }),
            {
                wrapper: createWrapper(),
            }
        )

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(api.browseRuntimeDirectory).toHaveBeenCalledWith(TEST_RUNTIME_PROJECTS_PATH)
        expect(result.current.currentPath).toBe(TEST_RUNTIME_PROJECTS_PATH)
        expect(result.current.parentPath).toBe(TEST_RUNTIME_HOME_PATH)
        expect(result.current.entries).toEqual([{ name: 'viby', path: TEST_RUNTIME_PROJECT_PATH, type: 'directory' }])
        expect(result.current.roots).toEqual([{ kind: 'home', path: TEST_RUNTIME_HOME_PATH }])
        expect(result.current.hasCurrentDirectory).toBe(true)
    })

    it('surfaces runtime browse errors without throwing away root shortcuts', async () => {
        const api = {
            browseRuntimeDirectory: vi.fn().mockResolvedValue({
                success: false,
                roots: [{ kind: 'home', path: TEST_RUNTIME_HOME_PATH }],
                error: 'Directory not found',
            }),
        } as unknown as ApiClient

        const { result } = renderHook(
            () =>
                useRuntimeDirectoryBrowser({
                    api,
                    initialPath: `${TEST_RUNTIME_HOME_PATH}/missing`,
                    enabled: true,
                }),
            {
                wrapper: createWrapper(),
            }
        )

        await waitFor(() => {
            expect(result.current.isLoading).toBe(false)
        })

        expect(result.current.error).toBe('Could not browse local folders right now. Please try again.')
        expect(result.current.roots).toEqual([{ kind: 'home', path: TEST_RUNTIME_HOME_PATH }])
        expect(result.current.hasCurrentDirectory).toBe(false)
    })
})
