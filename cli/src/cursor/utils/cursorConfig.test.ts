import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => ({
    vibyHomeDir: `${process.env.TMPDIR ?? '/tmp'}/viby-cursor-runtime-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
}))

vi.mock('@/configuration', () => ({
    configuration: {
        get vibyHomeDir() {
            return harness.vibyHomeDir
        },
    },
}))

import { buildCursorProcessEnv, ensureCursorConfig, resolveCursorConfigDir } from './cursorConfig'

describe('cursorConfig', () => {
    afterEach(() => {
        delete process.env.CURSOR_CONFIG_DIR
        rmSync(harness.vibyHomeDir, { recursive: true, force: true })
        harness.vibyHomeDir = mkdtempSync(join(tmpdir(), 'viby-cursor-runtime-'))
    })

    it('copies the current Cursor config and injects the session-scoped viby MCP server', () => {
        const sourceConfigDir = mkdtempSync(join(tmpdir(), 'viby-cursor-source-'))
        process.env.CURSOR_CONFIG_DIR = sourceConfigDir
        writeFileSync(join(sourceConfigDir, 'cli-config.json'), JSON.stringify({ theme: 'dark' }, null, 2), 'utf-8')
        writeFileSync(
            join(sourceConfigDir, 'mcp.json'),
            JSON.stringify(
                {
                    mcpServers: {
                        existing: {
                            type: 'stdio',
                            command: 'existing-cli',
                            args: ['serve'],
                        },
                    },
                },
                null,
                2
            ),
            'utf-8'
        )

        const { configDir, mcpConfigPath } = ensureCursorConfig('session-1', {
            command: 'viby',
            args: ['mcp', '--tool', 'get_snapshot'],
        })

        expect(configDir).toBe(resolveCursorConfigDir('session-1'))
        expect(JSON.parse(readFileSync(join(configDir, 'cli-config.json'), 'utf-8'))).toEqual({
            theme: 'dark',
        })
        expect(JSON.parse(readFileSync(mcpConfigPath, 'utf-8'))).toEqual({
            mcpServers: {
                existing: {
                    type: 'stdio',
                    command: 'existing-cli',
                    args: ['serve'],
                },
                viby: {
                    type: 'stdio',
                    command: 'viby',
                    args: ['mcp', '--tool', 'get_snapshot'],
                },
            },
        })
        expect(buildCursorProcessEnv(configDir).CURSOR_CONFIG_DIR).toBe(configDir)

        rmSync(sourceConfigDir, { recursive: true, force: true })
    })
})
