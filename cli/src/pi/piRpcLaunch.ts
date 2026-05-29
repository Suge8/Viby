import { spawn } from 'node:child_process'
import { compareAgentConfigVersions, parseAgentConfigVersionOutput } from '@viby/protocol/agentConfig'

const VERSION_PROBE_TIMEOUT_MS = 5_000
const EXACT_SESSION_ID_MIN_VERSION = '0.76.0'

export type PiSessionResumeFlag = '--session' | '--session-id'

export function resolvePiSessionResumeFlagFromVersionOutput(output: string): PiSessionResumeFlag {
    const version = parseAgentConfigVersionOutput(output)
    const comparison = version ? compareAgentConfigVersions(version, EXACT_SESSION_ID_MIN_VERSION) : null
    return comparison !== null && comparison >= 0 ? '--session-id' : '--session'
}

export function buildPiRpcArgs(
    options: { model?: string; resumeSessionId?: string },
    sessionFlag: PiSessionResumeFlag
): string[] {
    const args = ['--mode', 'rpc']
    const model = options.model?.trim()
    if (model) args.push('--model', model)
    const resumeSessionId = options.resumeSessionId?.trim()
    if (resumeSessionId) args.push(sessionFlag, resumeSessionId)
    return args
}

async function readPiCliVersionOutput(
    command: string,
    options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<string | null> {
    return await new Promise<string | null>((resolve) => {
        const child = spawn(command, ['--version'], {
            cwd: options.cwd,
            env: options.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let done = false
        let output = ''
        let timeout: ReturnType<typeof setTimeout> | null = null
        const finish = (value: string | null): void => {
            if (done) return
            done = true
            if (timeout) clearTimeout(timeout)
            resolve(value)
        }
        timeout = setTimeout(() => {
            child.kill('SIGKILL')
            finish(null)
        }, VERSION_PROBE_TIMEOUT_MS)
        timeout.unref?.()
        child.stdout.on('data', (chunk) => {
            output += chunk.toString()
        })
        child.stderr.on('data', (chunk) => {
            output += chunk.toString()
        })
        child.once('error', () => finish(null))
        child.once('exit', () => finish(output))
    })
}

export async function resolvePiSessionResumeFlag(
    command: string,
    options: { cwd: string; env: NodeJS.ProcessEnv }
): Promise<PiSessionResumeFlag> {
    const output = await readPiCliVersionOutput(command, options)
    return output ? resolvePiSessionResumeFlagFromVersionOutput(output) : '--session'
}
