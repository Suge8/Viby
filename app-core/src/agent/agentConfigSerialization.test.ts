import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAgentConfigFields } from '@viby/protocol/agentConfig'
import { afterEach, describe, expect, it } from 'vitest'
import { applyJsonConfigValues, readJsonConfigValues, readJsonSettings, writeJsonSettings } from './agentConfigJson'
import { readTomlConfigValues, readTomlSettings, writeTomlSettings } from './agentConfigToml'

const tempDirs: string[] = []

function makeTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'viby-agent-config-serialization-'))
    tempDirs.push(path)
    return path
}

afterEach(() => {
    for (const path of tempDirs.splice(0)) {
        rmSync(path, { recursive: true, force: true })
    }
})

describe('agent config serialization', () => {
    it('reads JSON settings with comments and trailing commas without mutating string values', async () => {
        const path = join(makeTempDir(), 'settings.json')
        writeFileSync(
            path,
            `{
  // user note
  "model": "sonnet",
  "url": "https://example.com/a//b",
  "pattern": "literal /* not comment */ value",
  "permissions": {
    "deny": ["Read(./private)",],
  },
}`
        )

        const settings = await readJsonSettings(path)

        expect(settings.model).toBe('sonnet')
        expect(settings.url).toBe('https://example.com/a//b')
        expect(settings.pattern).toBe('literal /* not comment */ value')
        expect(settings.permissions).toEqual({ deny: ['Read(./private)'] })
    })

    it('applies JSON values with deletion and Claude permission transforms', async () => {
        const fields = getAgentConfigFields('claude')
        const current = {
            model: 'haiku',
            editorMode: 'vim',
            permissions: { deny: ['Read(./private)'] },
            keep: { nested: true },
        }

        const next = applyJsonConfigValues(current, fields, {
            'claude.model': 'sonnet',
            'claude.editorMode': null,
            'claude.permissions.disableBypassPermissionsMode': true,
            'claude.permissions.denySensitiveFiles': true,
        })
        const values = readJsonConfigValues(next, fields)

        expect(next.model).toBe('sonnet')
        expect(next.editorMode).toBeUndefined()
        expect(next.keep).toEqual({ nested: true })
        expect(values['claude.permissions.disableBypassPermissionsMode']).toBe(true)
        expect(values['claude.permissions.denySensitiveFiles']).toBe(true)
        expect((next.permissions as { deny: string[] }).deny).toEqual(
            expect.arrayContaining(['Read(./private)', 'Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)'])
        )
    })

    it('writes JSON settings with parent directories and stable final newline', async () => {
        const path = join(makeTempDir(), 'nested', 'settings.json')

        await writeJsonSettings(path, { model: 'gemini-2.5-flash', tools: { useRipgrep: true } })

        expect(readFileSync(path, 'utf-8')).toBe(
            `${JSON.stringify({ model: 'gemini-2.5-flash', tools: { useRipgrep: true } }, null, 2)}\n`
        )
    })

    it('updates TOML root and section keys while preserving comments and unknown sections', async () => {
        const path = join(makeTempDir(), 'config.toml')
        writeFileSync(
            path,
            '# keep me\nmodel = "gpt-5.2"\n\n[custom]\nkeep = true\n\n[history]\npersistence = "none"\n'
        )

        await writeTomlSettings(path, getAgentConfigFields('codex'), {
            'codex.model': 'gpt-5.4',
            'codex.model_reasoning_effort': 'high',
            'codex.sandbox_workspace_write.network_access': true,
            'codex.history.persistence': null,
        })
        const raw = readFileSync(path, 'utf-8')

        expect(raw).toContain('# keep me')
        expect(raw).toContain('model = "gpt-5.4"')
        expect(raw).toContain('model_reasoning_effort = "high"')
        expect(raw).toContain('[custom]\nkeep = true')
        expect(raw).toContain('[sandbox_workspace_write]\nnetwork_access = true')
        expect(raw).not.toContain('persistence = "none"')
        expect(raw.endsWith('\n')).toBe(true)
    })

    it('reads TOML defaults only when persisted values are absent or unsupported', async () => {
        const path = join(makeTempDir(), 'config.toml')
        writeFileSync(path, 'model = "gpt-5.5"\nweb_search = true\nsandbox_workspace_write = "bad"\n')
        const fields = getAgentConfigFields('codex')

        const values = readTomlConfigValues(await readTomlSettings(path), fields)

        expect(values['codex.model']).toBe('gpt-5.5')
        expect(values['codex.web_search']).toBe(true)
        expect(values['codex.sandbox_workspace_write.network_access']).toBe(false)
    })
})
