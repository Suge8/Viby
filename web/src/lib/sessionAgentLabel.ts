export type SessionAgentBrand = 'claude' | 'codex' | 'copilot' | 'cursor' | 'gemini' | 'opencode' | 'pi' | 'unknown'

const SESSION_AGENT_BRANDS: Record<string, SessionAgentBrand> = {
    claude: 'claude',
    codex: 'codex',
    copilot: 'copilot',
    cursor: 'cursor',
    gemini: 'gemini',
    opencode: 'opencode',
    pi: 'pi',
}

const SESSION_AGENT_LABELS: Record<SessionAgentBrand, string> = {
    claude: 'Claude',
    codex: 'Codex',
    copilot: 'Copilot',
    cursor: 'Cursor',
    gemini: 'Gemini',
    opencode: 'OpenCode',
    pi: 'Pi',
    unknown: 'Unknown',
}

export function getSessionAgentBrand(driver?: string | null): SessionAgentBrand {
    const normalizedDriver = driver?.trim().toLowerCase()
    if (!normalizedDriver) {
        return 'unknown'
    }

    return SESSION_AGENT_BRANDS[normalizedDriver] ?? 'unknown'
}

export function getSessionAgentLabel(driver?: string | null): string {
    return SESSION_AGENT_LABELS[getSessionAgentBrand(driver)]
}

export function formatSessionAgentLabel(driver: unknown): string | null {
    if (typeof driver !== 'string') {
        return null
    }

    const normalizedDriver = driver.trim()
    if (normalizedDriver.length === 0) {
        return null
    }

    const knownBrand = SESSION_AGENT_BRANDS[normalizedDriver.toLowerCase()]
    return knownBrand ? SESSION_AGENT_LABELS[knownBrand] : normalizedDriver
}
