import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRuntimePathsExists } from './useRuntimePathsExists'

describe('useRuntimePathsExists', () => {
    it('does not loop path existence resets when there are no paths to check', async () => {
        const api = {
            checkRuntimePathsExists: vi.fn(async () => ({ exists: {} })),
        }

        const { result, rerender } = renderHook(
            ({ paths }: { paths: string[] }) => useRuntimePathsExists(api as never, paths),
            {
                initialProps: { paths: [] },
            }
        )

        expect(result.current.pathExistence).toEqual({})
        rerender({ paths: [] })
        expect(result.current.pathExistence).toEqual({})
        expect(api.checkRuntimePathsExists).not.toHaveBeenCalled()
    })

    it('hydrates path existence once per stable query and avoids redundant state churn', async () => {
        const api = {
            checkRuntimePathsExists: vi.fn(async () => ({
                exists: {
                    '/tmp/project': true,
                },
            })),
        }

        const { result, rerender } = renderHook(
            ({ paths }: { paths: string[] }) => useRuntimePathsExists(api as never, paths),
            {
                initialProps: { paths: ['/tmp/project'] },
            }
        )

        await waitFor(() => {
            expect(result.current.pathExistence).toEqual({
                '/tmp/project': true,
            })
        })

        rerender({ paths: ['/tmp/project'] })
        expect(result.current.pathExistence).toEqual({
            '/tmp/project': true,
        })
        expect(api.checkRuntimePathsExists).toHaveBeenCalledTimes(1)
    })

    it('dedupes equivalent path sets before requesting the runtime owner', async () => {
        const api = {
            checkRuntimePathsExists: vi.fn(async () => ({
                exists: {
                    '/tmp/project': true,
                    '/tmp/other': false,
                },
            })),
        }

        const { result, rerender } = renderHook(
            ({ paths }: { paths: string[] }) => useRuntimePathsExists(api as never, paths),
            {
                initialProps: { paths: [' /tmp/project ', '/tmp/other', '/tmp/project'] },
            }
        )

        await waitFor(() => {
            expect(result.current.pathExistence).toEqual({
                '/tmp/project': true,
                '/tmp/other': false,
            })
        })

        rerender({ paths: ['/tmp/other', '/tmp/project'] })

        expect(api.checkRuntimePathsExists).toHaveBeenCalledTimes(1)
        expect(api.checkRuntimePathsExists).toHaveBeenCalledWith(['/tmp/other', '/tmp/project'])
    })
})
