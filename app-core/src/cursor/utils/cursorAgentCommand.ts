import { resolveFirstAvailableCommand } from '@/utils/commandPath'

const CURSOR_AGENT_COMMAND_CANDIDATES = ['cursor-agent', 'agent'] as const

export function resolveCursorAgentCommand(options?: { bypassCache?: boolean }): string | null {
    const overrideCommand = process.env.VIBY_CURSOR_AGENT_COMMAND?.trim()
    if (overrideCommand) {
        return overrideCommand
    }

    return resolveFirstAvailableCommand(CURSOR_AGENT_COMMAND_CANDIDATES, options)
}

export function getDefaultCursorAgentCommand(options?: { bypassCache?: boolean }): string {
    const resolvedCommand = resolveCursorAgentCommand(options)
    if (!resolvedCommand) {
        throw new Error('Cursor Agent CLI not found. Install Cursor Agent or set VIBY_CURSOR_AGENT_COMMAND.')
    }

    return resolvedCommand
}
