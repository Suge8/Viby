import { describe, expect, it } from 'bun:test'
import { LOCAL_SESSION_RECOVERY_DRIVERS, LocalSessionCatalogRequestSchema } from './localSessions'

describe('localSessions', () => {
    it('keeps recover-local driver support explicit and provider-backed', () => {
        expect(LOCAL_SESSION_RECOVERY_DRIVERS).toEqual(['claude', 'codex', 'copilot', 'gemini', 'opencode', 'pi'])
    })

    it('accepts Pi local recovery requests and rejects unsupported Cursor catalog scans', () => {
        expect(LocalSessionCatalogRequestSchema.safeParse({ path: '/repo', driver: 'pi' }).success).toBe(true)
        expect(LocalSessionCatalogRequestSchema.safeParse({ path: '/repo', driver: 'cursor' }).success).toBe(false)
    })
})
