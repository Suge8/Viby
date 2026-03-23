import { runVibyMcpStdioBridge } from '@/codex/vibyMcpStdioBridge'
import type { CommandDefinition } from './types'

export const mcpCommand: CommandDefinition = {
    name: 'mcp',
    requiresRuntimeAssets: false,
    run: async ({ commandArgs }) => {
        await runVibyMcpStdioBridge(commandArgs)
    }
}
