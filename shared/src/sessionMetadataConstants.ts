import type { AgentFlavor } from './modes'

export const SESSION_METADATA_RUNNER_START_FLAG_KEY = 'startedFromRunner'
export const SESSION_METADATA_RUNTIME_HANDLE_MIGRATION_KEYS = {
    claude: 'claudeSessionId',
    codex: 'codexSessionId',
    gemini: 'geminiSessionId',
    opencode: 'opencodeSessionId',
    cursor: 'cursorSessionId',
    pi: 'piSessionId',
} as const satisfies Record<Exclude<AgentFlavor, 'copilot'>, string>
