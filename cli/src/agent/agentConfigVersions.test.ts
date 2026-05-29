import { getAgentConfigSupportedVersion, parseAgentConfigVersionOutput } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import { readAgentConfigVersion } from './agentConfigVersions'

describe('agent config versions', () => {
    it('parses common agent version outputs', () => {
        expect(parseAgentConfigVersionOutput('codex-cli 0.130.0')).toBe('0.130.0')
        expect(parseAgentConfigVersionOutput('2.1.143 (Claude Code)')).toBe('2.1.143')
        expect(parseAgentConfigVersionOutput('v1.0.48')).toBe('1.0.48')
        expect(parseAgentConfigVersionOutput('not installed')).toBeUndefined()
    })

    it('marks verified versions supported and older versions outdated', async () => {
        const minimum = getAgentConfigSupportedVersion('codex').version
        const supported = await readAgentConfigVersion('codex', async () => ({
            code: 0,
            output: `codex-cli ${minimum}`,
        }))
        const newer = await readAgentConfigVersion('codex', async () => ({
            code: 0,
            output: 'codex-cli 0.131.0',
        }))
        const outdated = await readAgentConfigVersion('codex', async () => ({ code: 0, output: 'codex-cli 0.1.0' }))

        expect(supported.status).toBe('supported')
        expect(supported.installedVersion).toBe(minimum)
        expect(newer.status).toBe('supported')
        expect(newer.installedVersion).toBe('0.131.0')
        expect(outdated.status).toBe('outdated')
        expect(outdated.supportedVersion).toBe(minimum)
    })

    it('marks Copilot missing when neither copilot nor gh copilot is available', async () => {
        const state = await readAgentConfigVersion('copilot', async (command) => {
            if (command[0] === 'copilot') return { code: 127, output: 'command not found' }
            return { code: 1, output: '! Copilot CLI not installed' }
        })

        expect(state.status).toBe('missing')
    })
})
