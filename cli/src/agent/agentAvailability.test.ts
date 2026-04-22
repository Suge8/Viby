import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listAgentAvailability } from './agentAvailability'

const harness = vi.hoisted(() => ({
    claudePath: vi.fn(),
    codexPath: vi.fn(),
    cursorCommand: vi.fn(),
    commandAvailability: vi.fn(),
    geminiRuntimeConfig: vi.fn(),
    piLaunchConfig: vi.fn(),
}))

vi.mock('@/claude/sdk/utils', () => ({
    getDefaultClaudeCodePath: harness.claudePath,
}))

vi.mock('@/codex/utils/codexPath', () => ({
    getDefaultCodexPath: harness.codexPath,
}))

vi.mock('@/cursor/utils/cursorAgentCommand', () => ({
    getDefaultCursorAgentCommand: harness.cursorCommand,
}))

vi.mock('@/utils/commandPath', () => ({
    resolveFirstAvailableCommand: harness.commandAvailability,
}))

vi.mock('@/gemini/utils/config', () => ({
    resolveGeminiRuntimeConfig: harness.geminiRuntimeConfig,
}))

vi.mock('@/pi/launchConfig', () => ({
    resolvePiAgentLaunchConfig: harness.piLaunchConfig,
}))

describe('listAgentAvailability', () => {
    beforeEach(() => {
        harness.claudePath.mockReset().mockReturnValue('/usr/local/bin/claude')
        harness.codexPath.mockReset().mockReturnValue('/usr/local/bin/codex')
        harness.cursorCommand.mockReset().mockReturnValue('cursor-agent')
        harness.commandAvailability
            .mockReset()
            .mockImplementation((candidates: readonly string[]) => candidates[0] ?? null)
        harness.geminiRuntimeConfig.mockReset().mockReturnValue({ token: 'token', modelSource: 'env' })
        harness.piLaunchConfig.mockReset().mockResolvedValue({
            agent: 'pi',
            defaultModel: 'openai/gpt-5.4',
            defaultModelReasoningEffort: 'high',
            availableModels: [{ id: 'openai/gpt-5.4', label: 'GPT-5.4', supportedThinkingLevels: ['none', 'high'] }],
        })
    })

    it('reports ready status for drivers whose launch prerequisites resolve', async () => {
        const response = await listAgentAvailability({ directory: '/tmp/project', forceRefresh: true })

        expect(response.agents.every((agent) => agent.status === 'ready')).toBe(true)
    })

    it('downgrades Gemini and Pi to setup-required when auth or models are missing', async () => {
        harness.geminiRuntimeConfig.mockReturnValue({ token: undefined, modelSource: 'terminal-default' })
        harness.piLaunchConfig.mockResolvedValue({
            agent: 'pi',
            defaultModel: null,
            defaultModelReasoningEffort: null,
            availableModels: [],
        })

        const response = await listAgentAvailability({ directory: '/tmp/project-2', forceRefresh: true })
        const gemini = response.agents.find((agent) => agent.driver === 'gemini')
        const pi = response.agents.find((agent) => agent.driver === 'pi')

        expect(gemini).toMatchObject({ status: 'setup_required', resolution: 'configure' })
        expect(pi).toMatchObject({ status: 'setup_required', resolution: 'configure' })
    })

    it('reports missing CLIs as install-required without affecting other drivers', async () => {
        harness.claudePath.mockImplementation(() => {
            throw new Error('Claude missing')
        })
        harness.commandAvailability.mockImplementation((candidates: readonly string[]) =>
            candidates[0] === 'opencode' ? null : (candidates[0] ?? null)
        )

        const response = await listAgentAvailability({ directory: '/tmp/project-3', forceRefresh: true })

        expect(response.agents.find((agent) => agent.driver === 'claude')).toMatchObject({
            status: 'not_installed',
            resolution: 'install',
        })
        expect(response.agents.find((agent) => agent.driver === 'opencode')).toMatchObject({
            status: 'not_installed',
            resolution: 'install',
        })
        expect(response.agents.find((agent) => agent.driver === 'codex')).toMatchObject({
            status: 'ready',
            resolution: 'none',
        })
    })

    it('bypasses cached availability when a force refresh is requested', async () => {
        const initialResponse = await listAgentAvailability({ directory: '/tmp/project-4', forceRefresh: true })
        expect(initialResponse.agents.find((agent) => agent.driver === 'opencode')).toMatchObject({
            status: 'ready',
            resolution: 'none',
        })

        harness.commandAvailability.mockImplementation((candidates: readonly string[]) =>
            candidates[0] === 'opencode' ? null : (candidates[0] ?? null)
        )

        const cachedResponse = await listAgentAvailability({ directory: '/tmp/project-4' })
        expect(cachedResponse.agents.find((agent) => agent.driver === 'opencode')).toMatchObject({
            status: 'ready',
            resolution: 'none',
        })

        const refreshedResponse = await listAgentAvailability({ directory: '/tmp/project-4', forceRefresh: true })
        expect(refreshedResponse.agents.find((agent) => agent.driver === 'opencode')).toMatchObject({
            status: 'not_installed',
            resolution: 'install',
        })
    })
})
