import { spawn } from 'node:child_process'

function appendNodeOption(value, option) {
    if (value?.split(/\s+/).includes(option)) {
        return value
    }

    return [value, option].filter(Boolean).join(' ')
}

const viteCommand = process.platform === 'win32' ? 'vite.cmd' : 'vite'
const devServer = spawn(viteCommand, ['--host', '127.0.0.1', '--port', '1420'], {
    env: {
        ...process.env,
        NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, '--no-deprecation'),
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
})

devServer.on('exit', (code, signal) => {
    process.exitCode = signal ? 0 : (code ?? 1)
})
