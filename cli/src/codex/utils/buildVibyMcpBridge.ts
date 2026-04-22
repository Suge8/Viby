import type { ApiSessionClient } from '@/api/apiSession'
import { startVibyServer } from '@/claude/utils/startVibyServer'
import { getVibyCliCommand } from '@/utils/spawnVibyCLI'

export interface McpServerEntry {
    command: string
    args: string[]
}

export type McpServersConfig = Record<string, McpServerEntry>

export interface VibyMcpBridge {
    server: {
        url: string
        stop: () => void
    } | null
    mcpServers: McpServersConfig
}

const VIBY_MCP_SERVER_NAME = 'viby'

function buildBridgeCommandArgs(url: string, toolNames: readonly string[]): string[] {
    return ['mcp', '--url', url, ...toolNames.flatMap((toolName) => ['--tool', toolName])]
}

export async function buildVibyMcpBridge(client: ApiSessionClient): Promise<VibyMcpBridge> {
    const vibyServer = await startVibyServer(client)
    if (!vibyServer) {
        return {
            server: null,
            mcpServers: {},
        }
    }
    const bridgeCommand = getVibyCliCommand(buildBridgeCommandArgs(vibyServer.url, vibyServer.toolNames))

    return {
        server: {
            url: vibyServer.url,
            stop: vibyServer.stop,
        },
        mcpServers: {
            [VIBY_MCP_SERVER_NAME]: {
                command: bridgeCommand.command,
                args: bridgeCommand.args,
            },
        },
    }
}
