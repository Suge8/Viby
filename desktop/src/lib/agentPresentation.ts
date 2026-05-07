import type { AgentFlavor } from '@viby/protocol'
import type { DesktopCopy } from './desktopCopy'

export const AGENT_LABELS = {
    claude: 'Claude Code',
    codex: 'Codex CLI',
    gemini: 'Gemini CLI',
    opencode: 'OpenCode',
    cursor: 'Cursor',
    pi: 'Pi',
    copilot: 'Copilot',
} as const satisfies Record<AgentFlavor, string>

export const AGENT_DESCRIPTION_KEYS = {
    claude: 'agentClaudeDescription',
    codex: 'agentCodexDescription',
    gemini: 'agentGeminiDescription',
    opencode: 'agentOpencodeDescription',
    cursor: 'agentCursorDescription',
    pi: 'agentPiDescription',
    copilot: 'agentCopilotDescription',
} as const satisfies Record<AgentFlavor, keyof DesktopCopy>

export const AGENT_ICONS = {
    claude: '/agent-claude.png',
    codex: '/agent-codex.png',
    gemini: '/agent-gemini.svg',
    opencode: '/agent-opencode.png',
    cursor: '/agent-cursor.ico',
    pi: '/agent-pi.svg',
    copilot: '/agent-copilot.svg',
} as const satisfies Record<AgentFlavor, string>
