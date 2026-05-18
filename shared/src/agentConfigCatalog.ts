import type { AgentConfigDriver, AgentConfigFieldDefinition } from './agentConfig'
import { CODEX_CLAUDE_AGENT_CONFIG_FIELDS } from './agentConfigCatalogCodexClaude'
import { CODEX_CLAUDE_LATEST_CONFIG_FIELDS } from './agentConfigCatalogCodexClaudeLatest'
import { EXTRA_AGENT_CONFIG_FIELDS } from './agentConfigCatalogExtra'
import { GEMINI_PI_COPILOT_AGENT_CONFIG_FIELDS } from './agentConfigCatalogGeminiPiCopilot'
import { GEMINI_PI_COPILOT_LATEST_CONFIG_FIELDS } from './agentConfigCatalogGeminiPiCopilotLatest'
import { PI_COPILOT_LATEST_CONFIG_FIELDS } from './agentConfigCatalogPiCopilotLatest'

export const AGENT_CONFIG_FIELDS = [
    ...CODEX_CLAUDE_AGENT_CONFIG_FIELDS,
    ...GEMINI_PI_COPILOT_AGENT_CONFIG_FIELDS,
    ...EXTRA_AGENT_CONFIG_FIELDS,
    ...CODEX_CLAUDE_LATEST_CONFIG_FIELDS,
    ...GEMINI_PI_COPILOT_LATEST_CONFIG_FIELDS,
    ...PI_COPILOT_LATEST_CONFIG_FIELDS,
] as const satisfies readonly AgentConfigFieldDefinition[]

export function getAgentConfigFields(driver: AgentConfigDriver): readonly AgentConfigFieldDefinition[] {
    return AGENT_CONFIG_FIELDS.filter((fieldDefinition) => fieldDefinition.driver === driver)
}
