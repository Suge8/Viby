import { lazy, type LazyExoticComponent } from 'react'
import type { ToolViewComponent } from '@/components/ToolCard/views/_all'

const INLINE_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'TodoWrite',
    'update_plan',
    'CodexDiff',
    'AskUserQuestion',
    'ExitPlanMode',
    'ask_user_question',
    'exit_plan_mode',
    'request_user_input'
])

const FULL_TOOL_NAMES = new Set([
    'Edit',
    'MultiEdit',
    'Write',
    'CodexDiff',
    'CodexPatch',
    'AskUserQuestion',
    'ExitPlanMode',
    'ask_user_question',
    'exit_plan_mode',
    'request_user_input'
])

const inlineViewCache = new Map<string, LazyExoticComponent<ToolViewComponent>>()
const fullViewCache = new Map<string, LazyExoticComponent<ToolViewComponent>>()
const resultViewCache = new Map<string, LazyExoticComponent<ToolViewComponent>>()

function createNullView(): ToolViewComponent {
    return () => null
}

function getCachedLazyView(
    cache: Map<string, LazyExoticComponent<ToolViewComponent>>,
    cacheKey: string,
    loadView: () => Promise<ToolViewComponent | null>
): LazyExoticComponent<ToolViewComponent> {
    const cached = cache.get(cacheKey)
    if (cached) {
        return cached
    }

    const next = lazy(async () => {
        const View = await loadView()
        return {
            default: View ?? createNullView()
        }
    })
    cache.set(cacheKey, next)
    return next
}

export function getLazyToolViewComponent(toolName: string): LazyExoticComponent<ToolViewComponent> | null {
    if (!INLINE_TOOL_NAMES.has(toolName)) {
        return null
    }

    return getCachedLazyView(inlineViewCache, toolName, async () => {
        const module = await import('@/components/ToolCard/views/_all')
        return module.getToolViewComponent(toolName)
    })
}

export function getLazyToolFullViewComponent(toolName: string): LazyExoticComponent<ToolViewComponent> | null {
    if (!FULL_TOOL_NAMES.has(toolName)) {
        return null
    }

    return getCachedLazyView(fullViewCache, toolName, async () => {
        const module = await import('@/components/ToolCard/views/_all')
        return module.getToolFullViewComponent(toolName)
    })
}

export function getLazyToolResultViewComponent(toolName: string): LazyExoticComponent<ToolViewComponent> {
    return getCachedLazyView(resultViewCache, toolName, async () => {
        const module = await import('@/components/ToolCard/views/_results')
        return module.getToolResultViewComponent(toolName)
    })
}
