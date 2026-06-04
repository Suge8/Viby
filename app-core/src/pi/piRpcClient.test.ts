import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAgentConfigVersionOutput } from '@viby/protocol/agentConfig'
import { describe, expect, it } from 'vitest'
import { PiRpcClient } from './piRpcClient'
import { buildPiRpcArgs, resolvePiSessionResumeFlagFromVersionOutput } from './piRpcLaunch'
import { PiRpcJsonlReader } from './piRpcProtocol'

describe('Pi RPC launch arguments', () => {
    it('uses exact session IDs for Pi versions that support automation-owned IDs', () => {
        expect(resolvePiSessionResumeFlagFromVersionOutput('pi 0.76.0')).toBe('--session-id')
        expect(resolvePiSessionResumeFlagFromVersionOutput('pi 0.80.1')).toBe('--session-id')
    })

    it('keeps the legacy session flag for older or unknown Pi versions', () => {
        expect(resolvePiSessionResumeFlagFromVersionOutput('pi 0.75.9')).toBe('--session')
        expect(resolvePiSessionResumeFlagFromVersionOutput('pi dev')).toBe('--session')
    })

    it('builds RPC args with the resolved session flag and trims empty optional values', () => {
        expect(buildPiRpcArgs({ model: ' openai/gpt-5 ', resumeSessionId: ' pi-session ' }, '--session-id')).toEqual([
            '--mode',
            'rpc',
            '--model',
            'openai/gpt-5',
            '--session-id',
            'pi-session',
        ])
        expect(buildPiRpcArgs({ model: ' ', resumeSessionId: '' }, '--session')).toEqual(['--mode', 'rpc'])
    })

    it('uses the shared semantic version parser for common CLI version output', () => {
        expect(parseAgentConfigVersionOutput('Pi Coding Agent v0.76.0')).toBe('0.76.0')
    })
})

describe('PiRpcJsonlReader', () => {
    it('preserves JSON strings while splitting only on LF records', () => {
        const lines: string[] = []
        const reader = new PiRpcJsonlReader((line) => lines.push(line))

        reader.push('{"text":"line separator \\u2028 kept"}\n{"ok":')
        reader.push('true}\n')

        expect(lines).toEqual(['{"text":"line separator \\u2028 kept"}', '{"ok":true}'])
    })
})

describe('PiRpcClient prompt lifecycle', () => {
    it('rejects prompt when Pi exits after accepting the request but before agent_end', async () => {
        const directory = mkdtempSync(join(tmpdir(), 'viby-pi-rpc-'))
        const command = join(directory, 'fake-pi.js')
        writeFileSync(
            command,
            `#!/usr/bin/env node
process.stdin.setEncoding('utf8')
let buffer = ''
process.stdin.on('data', (chunk) => {
  buffer += chunk
  const newlineIndex = buffer.indexOf('\\n')
  if (newlineIndex === -1) return
  const request = JSON.parse(buffer.slice(0, newlineIndex))
  process.stdout.write(JSON.stringify({ id: request.id, type: 'response', command: request.type, success: true }) + '\\n')
  process.exit(1)
})
`
        )
        chmodSync(command, 0o755)

        const client = new PiRpcClient({ cwd: directory, command })
        await client.start()

        await expect(client.prompt('hello')).rejects.toThrow('Pi RPC exited')
    })
})
