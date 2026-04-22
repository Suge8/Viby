import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { getDefaultCodexPath } from './utils/codexPath'

export function spawnCodexAppServer(): ChildProcessWithoutNullStreams {
    const codexPath = getDefaultCodexPath()
    return spawn(codexPath, ['app-server'], {
        env: Object.keys(process.env).reduce(
            (acc, key) => {
                const value = process.env[key]
                if (typeof value === 'string') {
                    acc[key] = value
                }
                return acc
            },
            {} as Record<string, string>
        ),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32' && codexPath === 'codex',
    })
}
