import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAuthSource } from './useAuthSource'

describe('useAuthSource', () => {
    afterEach(() => {
        window.localStorage.clear()
        window.history.replaceState(null, '', '/')
    })

    it('hydrates from storage on the first render without waiting for an effect sync', () => {
        window.localStorage.setItem('viby_access_token::https://hub-a.test', 'token-a')

        const { result } = renderHook(() => useAuthSource('https://hub-a.test'))

        expect(result.current.authSource).toEqual({
            type: 'accessToken',
            token: 'token-a',
        })
    })

    it('switches to the next baseUrl source immediately on rerender', () => {
        window.localStorage.setItem('viby_access_token::https://hub-a.test', 'token-a')
        window.localStorage.setItem('viby_access_token::https://hub-b.test', 'token-b')

        const { result, rerender } = renderHook(({ baseUrl }: { baseUrl: string }) => useAuthSource(baseUrl), {
            initialProps: { baseUrl: 'https://hub-a.test' },
        })

        expect(result.current.authSource).toEqual({
            type: 'accessToken',
            token: 'token-a',
        })

        rerender({ baseUrl: 'https://hub-b.test' })

        expect(result.current.authSource).toEqual({
            type: 'accessToken',
            token: 'token-b',
        })
    })
})
