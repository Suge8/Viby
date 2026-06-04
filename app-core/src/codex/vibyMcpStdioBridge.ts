const STDERR_PREFIX = '[viby-mcp]'

function writeBridgeError(message: string): void {
    process.stderr.write(`${STDERR_PREFIX} ${message}\n`)
}

export async function runVibyMcpStdioBridge(argv: string[]): Promise<void> {
    void argv
    writeBridgeError('No Viby MCP tools are available.')
    process.exit(2)
}
