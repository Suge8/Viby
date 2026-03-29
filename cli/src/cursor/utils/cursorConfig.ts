import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configuration } from '@/configuration';
import type { McpServerEntry } from '@/codex/utils/buildVibyMcpBridge';

const CLI_CONFIG_FILENAME = 'cli-config.json';
const MCP_CONFIG_FILENAME = 'mcp.json';
const VIBY_MCP_SERVER_NAME = 'viby';

type CursorMcpServerConfig = {
    type?: string;
    command?: string;
    args?: string[];
    [key: string]: unknown;
};

type CursorMcpConfig = {
    mcpServers?: Record<string, CursorMcpServerConfig>;
    [key: string]: unknown;
};

function readOptionalText(filePath: string): string | null {
    try {
        return readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

function writeFileIfChanged(filePath: string, content: string): void {
    const current = readOptionalText(filePath);
    if (current === content) {
        return;
    }

    writeFileSync(filePath, content, 'utf-8');
}

function parseCursorMcpConfig(content: string | null): CursorMcpConfig {
    if (!content) {
        return {};
    }

    try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return {};
        }
        return parsed as CursorMcpConfig;
    } catch {
        return {};
    }
}

function resolveSourceCursorConfigDir(): string {
    return process.env.CURSOR_CONFIG_DIR || join(homedir(), '.cursor');
}

function buildMergedCursorMcpConfig(mcpServer: McpServerEntry): CursorMcpConfig {
    const sourceConfigPath = join(resolveSourceCursorConfigDir(), MCP_CONFIG_FILENAME);
    const sourceConfig = parseCursorMcpConfig(readOptionalText(sourceConfigPath));

    return {
        ...sourceConfig,
        mcpServers: {
            ...(sourceConfig.mcpServers ?? {}),
            [VIBY_MCP_SERVER_NAME]: {
                type: 'stdio',
                command: mcpServer.command,
                args: mcpServer.args
            }
        }
    };
}

export function resolveCursorConfigDir(sessionId: string): string {
    return join(configuration.vibyHomeDir, 'tmp', 'cursor', sessionId, '.cursor');
}

export function ensureCursorConfig(
    sessionId: string,
    mcpServer: McpServerEntry
): { configDir: string; mcpConfigPath: string } {
    const sourceConfigDir = resolveSourceCursorConfigDir();
    const configDir = resolveCursorConfigDir(sessionId);
    mkdirSync(configDir, { recursive: true });

    const cliConfigText = readOptionalText(join(sourceConfigDir, CLI_CONFIG_FILENAME));
    if (cliConfigText !== null) {
        writeFileIfChanged(join(configDir, CLI_CONFIG_FILENAME), cliConfigText);
    }

    const mcpConfigPath = join(configDir, MCP_CONFIG_FILENAME);
    writeFileIfChanged(
        mcpConfigPath,
        JSON.stringify(buildMergedCursorMcpConfig(mcpServer), null, 2)
    );

    return { configDir, mcpConfigPath };
}

export function buildCursorProcessEnv(configDir: string): NodeJS.ProcessEnv {
    return {
        ...process.env,
        CURSOR_CONFIG_DIR: configDir
    };
}
