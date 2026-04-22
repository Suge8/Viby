import { isObject } from '@viby/protocol'

export function parseBashPermission(options: {
    permission: string
    allowedBashLiterals: Set<string>
    allowedBashPrefixes: Set<string>
}): void {
    if (options.permission === 'Bash') {
        return
    }

    const match = options.permission.match(/^Bash\((.+?)\)$/)
    if (!match) {
        return
    }

    const command = match[1]
    if (command.endsWith(':*')) {
        options.allowedBashPrefixes.add(command.slice(0, -2))
        return
    }

    options.allowedBashLiterals.add(command)
}

export function isAllowedBashCommand(options: {
    input: unknown
    allowedBashLiterals: ReadonlySet<string>
    allowedBashPrefixes: ReadonlySet<string>
}): boolean {
    const command = isObject(options.input) && typeof options.input.command === 'string' ? options.input.command : null
    if (!command) {
        return false
    }
    if (options.allowedBashLiterals.has(command)) {
        return true
    }
    for (const prefix of options.allowedBashPrefixes) {
        if (command.startsWith(prefix)) {
            return true
        }
    }
    return false
}
