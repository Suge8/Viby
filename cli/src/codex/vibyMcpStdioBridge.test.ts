import { beforeEach, describe, expect, it, vi } from 'vitest'

const harness = vi.hoisted(() => {
    const registeredTools = new Map<string, {
        config: Record<string, unknown>
        handler: (args: Record<string, unknown>) => Promise<unknown>
    }>()

    return {
        clientConnect: vi.fn(),
        clientCallTool: vi.fn(),
        serverConnect: vi.fn(),
        stderrWrite: vi.fn(),
        registeredTools,
        serverInfo: null as Record<string, unknown> | null,
        lastTransportUrl: null as string | null
    }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class MockClient {
        async connect(transport: unknown): Promise<void> {
            harness.clientConnect(transport)
        }

        async callTool(args: unknown): Promise<unknown> {
            return await harness.clientCallTool(args)
        }
    }
}))

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
    StreamableHTTPClientTransport: class MockStreamableHTTPClientTransport {
        constructor(url: URL) {
            harness.lastTransportUrl = url.toString()
        }
    }
}))

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: class MockMcpServer {
        constructor(info: Record<string, unknown>) {
            harness.serverInfo = info
        }

        registerTool(
            name: string,
            config: Record<string, unknown>,
            handler: (args: Record<string, unknown>) => Promise<unknown>
        ): void {
            harness.registeredTools.set(name, { config, handler })
        }

        async connect(transport: unknown): Promise<void> {
            harness.serverConnect(transport)
        }
    }
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: class MockStdioServerTransport {}
}))

import { runVibyMcpStdioBridge } from './vibyMcpStdioBridge'

describe('runVibyMcpStdioBridge', () => {
    beforeEach(() => {
        harness.clientConnect.mockReset()
        harness.clientCallTool.mockReset()
        harness.serverConnect.mockReset()
        harness.stderrWrite.mockReset()
        harness.registeredTools.clear()
        harness.serverInfo = null
        harness.lastTransportUrl = null
        vi.restoreAllMocks()
    })

    it('registers the requested tool and normalizes forwarded HTTP MCP results', async () => {
        harness.clientCallTool.mockResolvedValue({
            toolResult: {
                content: [{ type: 'text', text: 'snapshot-ok' }],
                isError: false,
                _meta: { ignored: true }
            }
        })

        await runVibyMcpStdioBridge([
            '--url',
            'http://127.0.0.1:4319/',
            '--tool',
            'team_get_snapshot'
        ])

        expect(harness.serverInfo).toEqual({
            name: 'VIBY MCP Bridge',
            version: '1.0.0'
        })
        expect(harness.registeredTools.has('team_get_snapshot')).toBe(true)
        expect(harness.registeredTools.has('change_title')).toBe(false)

        const handler = harness.registeredTools.get('team_get_snapshot')?.handler
        expect(handler).toBeTypeOf('function')

        const result = await handler!({})

        expect(harness.lastTransportUrl).toBe('http://127.0.0.1:4319/')
        expect(harness.clientConnect).toHaveBeenCalledTimes(1)
        expect(harness.clientCallTool).toHaveBeenCalledWith({
            name: 'team_get_snapshot',
            arguments: {}
        })
        expect(result).toEqual({
            content: [{ type: 'text', text: 'snapshot-ok' }],
            isError: false
        })
    })

    it('falls back to the default change_title tool when no tool filter is provided', async () => {
        harness.clientCallTool.mockResolvedValue({
            toolResult: {
                content: [{ type: 'text', text: 'title-ok' }],
                isError: false
            }
        })

        await runVibyMcpStdioBridge(['--url', 'http://127.0.0.1:4319/'])

        expect([...harness.registeredTools.keys()]).toEqual(['change_title'])
    })

    it('exits with code 2 when target URL is missing', async () => {
        const originalBridgeUrl = process.env.VIBY_HTTP_MCP_URL
        delete process.env.VIBY_HTTP_MCP_URL
        const exitError = new Error('process.exit:2')
        vi.spyOn(process.stderr, 'write').mockImplementation(((message?: string | Uint8Array) => {
            harness.stderrWrite(message)
            return true
        }) as typeof process.stderr.write)
        vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
            throw code === 2 ? exitError : new Error(`process.exit:${code}`)
        }) as typeof process.exit)

        try {
            await expect(runVibyMcpStdioBridge([])).rejects.toThrow(exitError)

            expect(harness.stderrWrite).toHaveBeenCalledWith(
                '[viby-mcp] Missing target URL. Set VIBY_HTTP_MCP_URL or pass --url <http://127.0.0.1:PORT>\n'
            )
        } finally {
            if (originalBridgeUrl === undefined) {
                delete process.env.VIBY_HTTP_MCP_URL
            } else {
                process.env.VIBY_HTTP_MCP_URL = originalBridgeUrl
            }
        }
    })
})
