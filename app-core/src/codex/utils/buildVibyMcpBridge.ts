import type { RuntimeSessionClient } from '@/api/runtimeSessionClient'
import { startVibyServer } from '@/claude/utils/startVibyServer'
import { getInternalRuntimeCommand } from '@/utils/spawnInternalRuntime'

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

export async function buildVibyMcpBridge(client: RuntimeSessionClient): Promise<VibyMcpBridge> {
    const vibyServer = await startVibyServer(client)
    if (!vibyServer) {
        return {
            server: null,
            mcpServers: {},
        }
    }
    const bridgeCommand = getInternalRuntimeCommand(buildBridgeCommandArgs(vibyServer.url, vibyServer.toolNames))

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
