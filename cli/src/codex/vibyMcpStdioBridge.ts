/**
 * VIBY MCP STDIO Bridge
 *
 * Mirrors a filtered set of VIBY tools over STDIO MCP and forwards every
 * invocation to an existing VIBY HTTP MCP server via Streamable HTTP.
 *
 * Configure the target HTTP MCP URL via env var `VIBY_HTTP_MCP_URL` or
 * via CLI flag `--url <http://127.0.0.1:PORT>`.
 *
 * Note: This process must not print to stdout as it would break MCP STDIO.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
    createToolErrorResult,
    getVibyToolDefinitionsByName,
    type VibyToolResult
} from '@/agent/vibyToolRegistry'

const STDIO_BRIDGE_SERVER_INFO = {
    name: 'VIBY MCP Bridge',
    version: '1.0.0'
} as const

const STDERR_PREFIX = '[viby-mcp]'
const DEFAULT_BRIDGE_TOOL_NAMES = ['change_title']

type ParsedBridgeArgs = {
    url: string | null
    toolNames: string[]
}

class BridgeExitError extends Error {
    readonly exitCode: number

    constructor(message: string, exitCode: number) {
        super(message)
        this.name = 'BridgeExitError'
        this.exitCode = exitCode
    }
}

function parseArgs(argv: string[]): ParsedBridgeArgs {
    let url: string | null = null
    const toolNames: string[] = []

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--url' && index + 1 < argv.length) {
            url = argv[index + 1]
            index += 1
            continue
        }
        if (arg === '--tool' && index + 1 < argv.length) {
            toolNames.push(argv[index + 1])
            index += 1
        }
    }

    return { url, toolNames }
}

function resolveBridgeBaseUrl(urlFromArgs: string | null): string {
    return urlFromArgs || process.env.VIBY_HTTP_MCP_URL || ''
}

function writeBridgeError(message: string): void {
    process.stderr.write(`${STDERR_PREFIX} ${message}\n`)
}

function resolveBridgeToolNames(requestedToolNames: string[]): string[] {
    if (requestedToolNames.length > 0) {
        return requestedToolNames
    }

    return [...DEFAULT_BRIDGE_TOOL_NAMES]
}

function requireBridgeBaseUrl(urlFromArgs: string | null): string {
    const baseUrl = resolveBridgeBaseUrl(urlFromArgs)
    if (!baseUrl) {
        throw new BridgeExitError(
            'Missing target URL. Set VIBY_HTTP_MCP_URL or pass --url <http://127.0.0.1:PORT>',
            2
        )
    }

    return baseUrl
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function normalizeForwardedToolResult(result: unknown): VibyToolResult {
    const candidate = isRecord(result) && 'toolResult' in result
        ? result.toolResult
        : result
    if (!isRecord(candidate) || !Array.isArray(candidate.content)) {
        throw new Error('Invalid MCP tool response from HTTP bridge')
    }

    return {
        content: candidate.content as VibyToolResult['content'],
        isError: candidate.isError === true
    }
}

export async function runVibyMcpStdioBridge(argv: string[]): Promise<void> {
    try {
        const { url: urlFromArgs, toolNames: requestedToolNames } = parseArgs(argv)
        const baseUrl = requireBridgeBaseUrl(urlFromArgs)

        let httpClient: Client | null = null

        async function ensureHttpClient(): Promise<Client> {
            if (httpClient) {
                return httpClient
            }

            const client = new Client(
                { name: 'viby-stdio-bridge', version: '1.0.0' },
                { capabilities: {} }
            )
            const transport = new StreamableHTTPClientTransport(new URL(baseUrl))
            await client.connect(transport)
            httpClient = client
            return client
        }

        const toolDefinitions = getVibyToolDefinitionsByName(
            resolveBridgeToolNames(requestedToolNames)
        )
        if (toolDefinitions.length === 0) {
            throw new BridgeExitError(
                'No valid tool definitions were provided to the stdio bridge.',
                2
            )
        }

        const server = new McpServer(STDIO_BRIDGE_SERVER_INFO)
        for (const definition of toolDefinitions) {
            server.registerTool<any, any>(
                definition.name,
                {
                    description: definition.description,
                    title: definition.title,
                    inputSchema: definition.inputSchema
                },
                async (args: Record<string, unknown>) => {
                    try {
                        const client = await ensureHttpClient()
                        const response = await client.callTool({
                            name: definition.name,
                            arguments: args
                        })
                        return normalizeForwardedToolResult(response)
                    } catch (error) {
                        return createToolErrorResult(error)
                    }
                }
            )
        }

        const stdio = new StdioServerTransport()
        await server.connect(stdio)
    } catch (error) {
        if (error instanceof BridgeExitError) {
            writeBridgeError(error.message)
            process.exit(error.exitCode)
        }

        writeBridgeError(`Fatal: ${error instanceof Error ? error.message : String(error)}`)
        process.exit(1)
    }
}
