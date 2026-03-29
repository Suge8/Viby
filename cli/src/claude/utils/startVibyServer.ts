/**
 * VIBY MCP server
 * Provides session-scoped VIBY tools over Streamable HTTP MCP.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ApiSessionClient } from '@/api/apiSession'
import {
    createToolErrorResult,
    getEnabledVibyToolDefinitions
} from '@/agent/vibyToolRegistry'
import { logger } from '@/ui/logger'

export async function startVibyServer(client: ApiSessionClient): Promise<{
    url: string
    toolNames: string[]
    stop: () => void
}> {
    const mcp = new McpServer({
        name: 'VIBY MCP',
        version: '1.0.0'
    })

    const toolDefinitions = getEnabledVibyToolDefinitions(client.teamContext)
    for (const definition of toolDefinitions) {
        mcp.registerTool<any, any>(definition.name, {
            description: definition.description,
            title: definition.title,
            inputSchema: definition.inputSchema
        }, async (args: Record<string, unknown>) => {
            try {
                const parsedArgs = definition.inputSchema.parse(args)
                const response = await definition.execute({
                    client,
                    teamContext: client.teamContext
                }, parsedArgs)
                logger.debug('[vibyMCP] Tool response', {
                    toolName: definition.name,
                    isError: response.isError
                })
                return response
            } catch (error) {
                logger.debug('[vibyMCP] Tool failed', {
                    toolName: definition.name,
                    error
                })
                return createToolErrorResult(error)
            }
        })
    }

    const transport = new StreamableHTTPServerTransport({
        // NOTE: Returning session id here will result in claude
        // sdk spawn to fail with `Invalid Request: Server already initialized`
        sessionIdGenerator: undefined
    })
    await mcp.connect(transport)

    const server = createServer(async (req, res) => {
        try {
            await transport.handleRequest(req, res)
        } catch (error) {
            logger.debug('Error handling request:', error)
            if (!res.headersSent) {
                res.writeHead(500).end()
            }
        }
    })

    const baseUrl = await new Promise<URL>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as AddressInfo
            resolve(new URL(`http://127.0.0.1:${addr.port}`))
        })
    })

    return {
        url: baseUrl.toString(),
        toolNames: toolDefinitions.map((definition) => definition.name),
        stop: () => {
            logger.debug('[vibyMCP] Stopping server')
            mcp.close()
            server.close()
        }
    }
}
