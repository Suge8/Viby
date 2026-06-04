const DEFAULT_TERMINAL_TYPE = 'xterm-256color'
const DEFAULT_TERMINAL_COLOR = 'truecolor'
const DEFAULT_TERMINAL_LANG = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'
const SENSITIVE_ENV_KEYS = new Set([
    'VIBY_HUB_OWNER_TOKEN',
    'VIBY_API_URL',
    'VIBY_HTTP_MCP_URL',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
])

export function getOptionalBun(): typeof Bun | null {
    return typeof Bun === 'undefined' ? null : Bun
}

export function resolveEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name]
    if (!raw) return fallback
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function resolveWindowsShellCommand(): string[] {
    const configuredShell = process.env.VIBY_TERMINAL_SHELL?.trim()
    if (configuredShell) return [configuredShell]

    const bun = getOptionalBun()
    for (const candidate of ['pwsh.exe', 'powershell.exe']) {
        try {
            const resolved = bun?.which?.(candidate)
            if (resolved) return [resolved, '-NoLogo']
        } catch {}
    }

    return [process.env.ComSpec || 'cmd.exe']
}

export function resolveShellCommand(): string[] {
    if (process.platform === 'win32') return resolveWindowsShellCommand()
    if (process.env.SHELL) return [process.env.SHELL]
    if (process.platform === 'darwin') return ['/bin/zsh']
    return ['/bin/bash']
}

export function normalizeTerminalInputForHost(data: string): string {
    if (process.platform !== 'win32') return data

    let normalized = ''
    for (let index = 0; index < data.length; index += 1) {
        const char = data[index]
        normalized += char === '\n' && data[index - 1] !== '\r' ? '\r' : char
    }
    return normalized
}

export function buildFilteredEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {}
    for (const [key, value] of Object.entries(process.env)) {
        if (!value || SENSITIVE_ENV_KEYS.has(key)) continue
        env[key] = value
    }
    env.TERM ??= DEFAULT_TERMINAL_TYPE
    env.COLORTERM ??= DEFAULT_TERMINAL_COLOR
    env.LANG ??= process.platform === 'win32' ? 'en_US.UTF-8' : DEFAULT_TERMINAL_LANG
    return env
}
