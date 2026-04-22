import { resolveSessionDriver } from '@viby/protocol'
import { getInputStringAny } from '@/lib/toolInputUtils'
import type { Session } from '@/types/api'

const CODEX_PERMISSION_DRIVERS = new Set(['codex', 'gemini', 'opencode'])
const CODEX_PERMISSION_TOOL_PREFIXES = ['Codex', 'Gemini', 'OpenCode']
const EDIT_PERMISSION_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const SESSION_DENY_PERMISSION_TOOLS = new Set(['exit_plan_mode', 'ExitPlanMode'])

export function isCodexPermissionSurface(session: Session, toolName: string): boolean {
    const sessionDriver = resolveSessionDriver(session.metadata)
    return (
        (sessionDriver !== null && CODEX_PERMISSION_DRIVERS.has(sessionDriver)) ||
        CODEX_PERMISSION_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))
    )
}

export function isEditPermissionTool(toolName: string): boolean {
    return EDIT_PERMISSION_TOOLS.has(toolName)
}

export function canAllowPermissionForSession(toolName: string, codex: boolean): boolean {
    return !codex && !isEditPermissionTool(toolName) && !SESSION_DENY_PERMISSION_TOOLS.has(toolName)
}

export function getPermissionToolSummary(input: unknown): string | null {
    return (
        getInputStringAny(input, ['command', 'cmd']) ??
        getInputStringAny(input, ['path', 'file_path', 'filePath', 'file']) ??
        getInputStringAny(input, ['message']) ??
        null
    )
}

export function buildPermissionSessionToolIdentifier(toolName: string, input: unknown): string {
    const command = toolName === 'Bash' ? getInputStringAny(input, ['command', 'cmd']) : null
    return toolName === 'Bash' && command ? `Bash(${command})` : toolName
}
