export type RouterRouteDefinition = {
    name: string
    parentRoute: string
    path: string
}

const CREATE_ROUTE_RE =
    /const\s+(\w+)\s*=\s*createRoute\(\{\s*[\s\S]*?getParentRoute:\s*\(\)\s*=>\s*(\w+)\s*,\s*path:\s*'([^']+)'\s*,[\s\S]*?\}\)/g
const ALLOWED_ROOT_ROUTE_NAMES = new Set(['indexRoute', 'sessionsRoute'])
const ALLOWED_ROOT_ROUTE_PATHS = new Set(['/', '/sessions'])

export function parseRouterRouteDefinitions(source: string): RouterRouteDefinition[] {
    const definitions: RouterRouteDefinition[] = []

    for (const match of source.matchAll(CREATE_ROUTE_RE)) {
        const [, name, parentRoute, path] = match
        definitions.push({ name, parentRoute, path })
    }

    return definitions
}

export function collectRootWorkspaceRouteViolations(source: string): string[] {
    const violations: string[] = []

    for (const route of parseRouterRouteDefinitions(source)) {
        if (route.parentRoute !== 'rootRoute') {
            continue
        }

        if (!ALLOWED_ROOT_ROUTE_NAMES.has(route.name)) {
            violations.push(
                `rootRoute child ${route.name} (${route.path}) creates a second top-level workspace entry; nest it under sessionsRoute`
            )
            continue
        }

        if (!ALLOWED_ROOT_ROUTE_PATHS.has(route.path)) {
            violations.push(`allowed root route ${route.name} must keep canonical path ${route.path}`)
        }
    }

    return violations
}
