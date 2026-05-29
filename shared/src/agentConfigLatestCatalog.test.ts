import { describe, expect, it } from 'vitest'
import { AGENT_CONFIG_FIELDS } from './agentConfig'
import { CODEX_CLAUDE_LATEST_CONFIG_FIELDS } from './agentConfigCatalogCodexClaudeLatest'
import { GEMINI_PI_COPILOT_LATEST_CONFIG_FIELDS } from './agentConfigCatalogGeminiPiCopilotLatest'
import { PI_COPILOT_LATEST_CONFIG_FIELDS } from './agentConfigCatalogPiCopilotLatest'

const latestFieldIds = new Set(
    [
        ...CODEX_CLAUDE_LATEST_CONFIG_FIELDS,
        ...GEMINI_PI_COPILOT_LATEST_CONFIG_FIELDS,
        ...PI_COPILOT_LATEST_CONFIG_FIELDS,
    ].map((field) => field.id)
)

describe('latest agent config catalog', () => {
    it('keeps volatile latest-only settings out of the baseline writable UI catalog', () => {
        expect(latestFieldIds.size).toBeGreaterThan(0)
        for (const field of AGENT_CONFIG_FIELDS) {
            expect(latestFieldIds.has(field.id), field.id).toBe(false)
        }
    })
})
