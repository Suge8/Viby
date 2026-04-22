import { describe, expect, it } from 'vitest'
import {
    buildSessionFilePath,
    buildSessionFilesPath,
    buildSessionHref,
    buildSessionTerminalPath,
    isSessionsIndexPath,
    isSessionsWorkspacePath,
    normalizeRoutePath,
    resolveDirectSessionIdFromPath,
    resolveSessionRouteParam,
    resolveSessionsParentNavigation,
    resolveSessionsParentPath,
} from './sessionRoutePaths'

describe('sessionRoutePaths', () => {
    it('normalizes trailing slashes and preserves root', () => {
        expect(normalizeRoutePath('/sessions/')).toBe('/sessions')
        expect(normalizeRoutePath('/sessions/settings///')).toBe('/sessions/settings')
        expect(normalizeRoutePath('/')).toBe('/')
    })

    it('builds canonical workspace paths', () => {
        expect(buildSessionHref('session-1')).toBe('/sessions/session-1')
        expect(buildSessionFilesPath('session-1')).toBe('/sessions/session-1/files')
        expect(buildSessionFilePath('session-1')).toBe('/sessions/session-1/file')
        expect(buildSessionTerminalPath('session-1')).toBe('/sessions/session-1/terminal')
    })

    it('distinguishes workspace and direct session paths', () => {
        expect(isSessionsIndexPath('/sessions/')).toBe(true)
        expect(isSessionsWorkspacePath('/sessions/settings')).toBe(true)
        expect(resolveSessionRouteParam('session-1')).toBe('session-1')
        expect(resolveSessionRouteParam('settings')).toBeNull()
        expect(resolveDirectSessionIdFromPath('/sessions/session-1')).toBe('session-1')
        expect(resolveDirectSessionIdFromPath('/sessions/new')).toBeNull()
        expect(resolveDirectSessionIdFromPath('/sessions/settings')).toBeNull()
        expect(resolveDirectSessionIdFromPath('/sessions/session-1/files')).toBeNull()
    })

    it('resolves the parent workspace path without creating a second back chain', () => {
        expect(resolveSessionsParentPath('/sessions/new')).toBe('/sessions')
        expect(resolveSessionsParentPath('/sessions/settings')).toBe('/sessions')
        expect(resolveSessionsParentPath('/sessions/session-1')).toBe('/sessions')
        expect(resolveSessionsParentPath('/sessions/session-1/files')).toBe('/sessions/session-1')
        expect(resolveSessionsParentPath('/sessions/session-1/file')).toBe('/sessions/session-1/files')
        expect(resolveSessionsParentPath('/sessions')).toBeNull()
    })

    it('resolves parent navigation, including the preserved file tab contract', () => {
        expect(
            resolveSessionsParentNavigation({
                pathname: '/sessions/session-1/file',
                search: { tab: 'directories' },
            })
        ).toEqual({
            to: '/sessions/session-1/files',
            search: { tab: 'directories' },
        })

        expect(
            resolveSessionsParentNavigation({
                pathname: '/sessions/session-1/terminal',
                search: {},
            })
        ).toEqual({ to: '/sessions/session-1' })
    })
})
