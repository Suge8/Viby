import { resolveSessionDriver } from '@viby/protocol'
import type { Session } from '../sync/syncEngine'

export function getSessionName(session: Session): string {
    if (session.metadata?.name) return session.metadata.name
    if (session.metadata?.summary?.text) return session.metadata.summary.text
    if (session.metadata?.path) {
        const parts = session.metadata.path.split('/').filter(Boolean)
        return parts.length > 0 ? parts[parts.length - 1] : session.id.slice(0, 8)
    }
    return session.id.slice(0, 8)
}

export function getAgentName(session: Session): string {
    const driver = resolveSessionDriver(session.metadata)
    if (driver === 'claude') return 'Claude'
    if (driver === 'codex') return 'Codex'
    if (driver === 'cursor') return 'Cursor'
    if (driver === 'gemini') return 'Gemini'
    if (driver === 'opencode') return 'OpenCode'
    if (driver === 'pi') return 'Pi'
    return 'Agent'
}
