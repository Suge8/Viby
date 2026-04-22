import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    toolCardViewsImports: 0,
    toolCardResultViewsImports: 0,
}))

vi.mock('@/components/ToolCard/views/_all', () => {
    harness.toolCardViewsImports += 1
    return {
        getToolViewComponent: () => null,
        getToolFullViewComponent: () => null,
    }
})

vi.mock('@/components/ToolCard/views/_results', () => {
    harness.toolCardResultViewsImports += 1
    return {
        getToolResultViewComponent: () => null,
    }
})

async function loadWorkspaceModules() {
    return await import('./sessionChatWorkspaceModules')
}

describe('sessionChatWorkspaceModules', () => {
    beforeEach(() => {
        vi.resetModules()
        harness.toolCardViewsImports = 0
        harness.toolCardResultViewsImports = 0
    })

    it('preloads the heavy tool views together for the chat workspace path', async () => {
        const module = await loadWorkspaceModules()

        await module.preloadSessionChatWorkspaceSurfaces()

        expect(harness.toolCardViewsImports).toBe(1)
        expect(harness.toolCardResultViewsImports).toBe(1)
    })
})
