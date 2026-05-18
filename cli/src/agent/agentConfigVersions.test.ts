import { getAgentConfigSupportedVersion } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import {
    assertAgentConfigVersionSupported,
    parseAgentConfigVersionOutput,
    readAgentConfigVersion,
} from './agentConfigVersions'

describe('agent config versions', () => {
    it('parses common agent version outputs', () => {
        expect(parseAgentConfigVersionOutput('codex-cli 0.130.0')).toBe('0.130.0')
        expect(parseAgentConfigVersionOutput('2.1.143 (Claude Code)')).toBe('2.1.143')
        expect(parseAgentConfigVersionOutput('v1.0.48')).toBe('1.0.48')
        expect(parseAgentConfigVersionOutput('not installed')).toBeUndefined()
    })

    it('marks exact latest versions supported and older versions unsupported', async () => {
        const latest = getAgentConfigSupportedVersion('codex').version
        const supported = await readAgentConfigVersion('codex', async () => ({
            code: 0,
            output: `codex-cli ${latest}`,
        }))
        const unsupported = await readAgentConfigVersion('codex', async () => ({ code: 0, output: 'codex-cli 0.1.0' }))

        expect(supported.status).toBe('supported')
        expect(supported.installedVersion).toBe(latest)
        expect(unsupported.status).toBe('unsupported')
        expect(unsupported.supportedVersion).toBe(latest)
    })

    it('requires the Copilot CLI command rather than only GitHub CLI being installed', async () => {
        const state = await readAgentConfigVersion('copilot', async (command) => {
            if (command[0] === 'copilot') return { code: 127, output: 'command not found' }
            return { code: 1, output: '! Copilot CLI not installed' }
        })

        expect(state.status).toBe('missing')
        await expect(assertAgentConfigVersionSupported('copilot', async () => state)).rejects.toThrow(
            'Unsupported copilot version'
        )
    })
})
