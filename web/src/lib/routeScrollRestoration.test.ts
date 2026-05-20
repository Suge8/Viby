import type { ParsedLocation } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { getRouteScrollRestorationKey } from './routeScrollRestoration'

function location(pathname: string, search: Record<string, unknown> = {}): ParsedLocation {
    return { pathname, search } as ParsedLocation
}

describe('getRouteScrollRestorationKey', () => {
    it('collapses repeated visits to the same route pathname', () => {
        expect(getRouteScrollRestorationKey(location('/sessions'))).toBe('/sessions')
        expect(getRouteScrollRestorationKey(location('/sessions/session-1/files', { tab: 'changes' }))).toBe(
            '/sessions/session-1/files'
        )
    })

    it('keeps bounded visible state in the route scroll key', () => {
        expect(
            getRouteScrollRestorationKey(location('/sessions/session-1/file', { path: 'src/App.tsx', staged: true }))
        ).toBe('/sessions/session-1/file?path=src/App.tsx&staged=true')
        expect(getRouteScrollRestorationKey(location('/sessions/session-1/files', { tab: 'directories' }))).toBe(
            '/sessions/session-1/files?tab=directories'
        )
        expect(getRouteScrollRestorationKey(location('/sessions/new', { mode: 'recover-local' }))).toBe(
            '/sessions/new?mode=recover-local'
        )
    })

    it('does not include unbounded history-entry keys', () => {
        expect(
            getRouteScrollRestorationKey({
                ...location('/sessions/settings'),
                state: { __TSR_key: 'opaque-history-entry' },
            } as ParsedLocation)
        ).toBe('/sessions/settings')
    })
})
