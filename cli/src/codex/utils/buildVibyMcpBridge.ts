/**
 * Unified MCP bridge setup for Codex local and remote modes.
 *
 * This module provides a single source of truth for starting the viby MCP
 * bridge server and generating the MCP server configuration that Codex needs.
 */

import { startVibyServer } from '@/claude/utils/startVibyServer';
import { getVibyCliCommand } from '@/utils/spawnVibyCLI';
import type { ApiSessionClient } from '@/api/apiSession';

/**
 * MCP server entry configuration.
 */
export interface McpServerEntry {
    command: string;
    args: string[];
}

/**
 * Map of MCP server names to their configurations.
 */
export type McpServersConfig = Record<string, McpServerEntry>;

/**
 * Result of starting the viby MCP bridge.
 */
export interface VibyMcpBridge {
    /** The running server instance */
    server: {
        url: string;
        stop: () => void;
    };
    /** MCP server config to pass to Codex (works for both CLI and SDK) */
    mcpServers: McpServersConfig;
}

/**
 * Start the viby MCP bridge server and return the configuration
 * needed to connect Codex to it.
 *
 * This is the single source of truth for MCP bridge setup,
 * used by both local and remote launchers.
 */
export async function buildVibyMcpBridge(client: ApiSessionClient): Promise<VibyMcpBridge> {
    const vibyServer = await startVibyServer(client);
    const bridgeCommand = getVibyCliCommand(['mcp', '--url', vibyServer.url]);

    return {
        server: {
            url: vibyServer.url,
            stop: vibyServer.stop
        },
        mcpServers: {
            viby: {
                command: bridgeCommand.command,
                args: bridgeCommand.args
            }
        }
    };
}
