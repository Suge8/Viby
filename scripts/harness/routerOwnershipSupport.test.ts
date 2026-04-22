import { describe, expect, it } from 'bun:test'
import { collectRootWorkspaceRouteViolations, parseRouterRouteDefinitions } from './routerOwnershipSupport'

describe('router ownership support', () => {
    it('parses TanStack route definitions with parent owners', () => {
        const source = `
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
})
const settingsRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'settings',
    component: Settings,
})
        `

        expect(parseRouterRouteDefinitions(source)).toEqual([
            { name: 'indexRoute', parentRoute: 'rootRoute', path: '/' },
            { name: 'settingsRoute', parentRoute: 'sessionsRoute', path: 'settings' },
        ])
    })

    it('accepts the single-shell root route layout', () => {
        const source = `
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
})
const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: Sessions,
})
const settingsRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: 'settings',
    component: Settings,
})
        `

        expect(collectRootWorkspaceRouteViolations(source)).toEqual([])
    })

    it('rejects extra root-level workspace routes', () => {
        const source = `
const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: Index,
})
const sessionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/sessions',
    component: Sessions,
})
const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: Settings,
})
        `

        expect(collectRootWorkspaceRouteViolations(source)).toEqual([
            'rootRoute child settingsRoute (/settings) creates a second top-level workspace entry; nest it under sessionsRoute',
        ])
    })
})
