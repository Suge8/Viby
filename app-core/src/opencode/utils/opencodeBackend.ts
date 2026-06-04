import { AcpSdkBackend } from '@/agent/backends/acp'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { buildOpencodeEnv } from './config'

function filterEnv(env: NodeJS.ProcessEnv): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
            result[key] = value
        }
    }
    return result
}

export function createOpencodeBackend(opts: { cwd?: string }): AcpSdkBackend {
    const env = buildOpencodeEnv()
    const args = ['acp', '--cwd', opts.cwd ?? getInvokedCwd()]

    return new AcpSdkBackend({
        command: 'opencode',
        args,
        env: filterEnv(env),
    })
}
