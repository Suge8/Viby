const LOCAL_LISTEN_HOST = '127.0.0.1'
const LAN_LISTEN_HOST = '0.0.0.0'

export interface ParsedHubFlags {
    host?: string
    port?: string
    publicAccessEnabled?: boolean
}

export class HubFlagError extends Error {}

function takeValue(args: string[], index: number, name: string): string {
    const value = args[index + 1]
    if (value === undefined || value.startsWith('-')) {
        throw new HubFlagError(`Missing value for ${name}.`)
    }
    return value
}

function setOnce<T>(current: T | undefined, next: T, name: string): T {
    if (current !== undefined && current !== next) {
        throw new HubFlagError(`Conflicting ${name} flags. Pick one.`)
    }
    return next
}

export function parseHubFlags(args: string[]): ParsedHubFlags {
    let host: string | undefined
    let port: string | undefined
    let publicAccessEnabled: boolean | undefined
    let consumed: 0 | 1

    for (let i = 0; i < args.length; i += 1 + consumed) {
        consumed = 0
        const arg = args[i]
        if (arg === '--host') {
            host = setOnce(host, takeValue(args, i, '--host'), 'host')
            consumed = 1
        } else if (arg.startsWith('--host=')) {
            host = setOnce(host, arg.slice('--host='.length), 'host')
        } else if (arg === '--port') {
            port = setOnce(port, takeValue(args, i, '--port'), 'port')
            consumed = 1
        } else if (arg.startsWith('--port=')) {
            port = setOnce(port, arg.slice('--port='.length), 'port')
        } else if (arg === '--local') {
            host = setOnce(host, LOCAL_LISTEN_HOST, 'host')
        } else if (arg === '--lan') {
            host = setOnce(host, LAN_LISTEN_HOST, 'host')
        } else if (arg === '--public') {
            publicAccessEnabled = setOnce(publicAccessEnabled, true, 'public access')
        } else if (arg === '--no-public') {
            publicAccessEnabled = setOnce(publicAccessEnabled, false, 'public access')
        } else {
            throw new HubFlagError(`Unknown flag: ${arg}`)
        }
    }

    return { host, port, publicAccessEnabled }
}

export function applyHubFlagsToEnv(flags: ParsedHubFlags, env: NodeJS.ProcessEnv = process.env): void {
    if (flags.host !== undefined) {
        env.VIBY_LISTEN_HOST = flags.host
    }
    if (flags.port !== undefined) {
        env.VIBY_LISTEN_PORT = flags.port
    }
    if (flags.publicAccessEnabled !== undefined) {
        env.VIBY_PUBLIC_ACCESS_ENABLED = flags.publicAccessEnabled ? 'true' : 'false'
    }
}
