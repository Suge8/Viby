import type { AgentConfigDriver, AgentConfigFieldDefinition } from './agentConfig'
import { CODEX_CLAUDE_AGENT_CONFIG_FIELDS } from './agentConfigCatalogCodexClaude'
import { EXTRA_AGENT_CONFIG_FIELDS } from './agentConfigCatalogExtra'
import { GEMINI_PI_COPILOT_AGENT_CONFIG_FIELDS } from './agentConfigCatalogGeminiPiCopilot'

export const AGENT_CONFIG_FIELDS = [
    ...CODEX_CLAUDE_AGENT_CONFIG_FIELDS,
    ...GEMINI_PI_COPILOT_AGENT_CONFIG_FIELDS,
    ...EXTRA_AGENT_CONFIG_FIELDS,
] as const satisfies readonly AgentConfigFieldDefinition[]

export function getAgentConfigFields(driver: AgentConfigDriver): readonly AgentConfigFieldDefinition[] {
    return AGENT_CONFIG_FIELDS.filter((fieldDefinition) => fieldDefinition.driver === driver)
}
