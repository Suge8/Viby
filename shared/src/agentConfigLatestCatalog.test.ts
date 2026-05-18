import { describe, expect, it } from 'vitest'
import type { AgentConfigControl, AgentConfigDriver, AgentConfigFieldValue } from './agentConfig'
import { AGENT_CONFIG_FIELDS } from './agentConfig'

type LatestFieldExpectation = {
    driver: AgentConfigDriver
    group: string
    path: string
    control: AgentConfigControl
    defaultValue?: AgentConfigFieldValue
    options?: readonly string[]
}

const LATEST_FIELD_EXPECTATIONS = {
    'codex.model_provider': {
        driver: 'codex',
        group: 'model',
        path: 'model_provider',
        control: 'text',
    },
    'codex.model_verbosity': {
        driver: 'codex',
        group: 'model',
        path: 'model_verbosity',
        control: 'select',
        options: ['low', 'medium', 'high'],
    },
    'codex.plan_mode_reasoning_effort': {
        driver: 'codex',
        group: 'planning',
        path: 'plan_mode_reasoning_effort',
        control: 'select',
        options: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    },
    'codex.hide_agent_reasoning': {
        driver: 'codex',
        group: 'privacy',
        path: 'hide_agent_reasoning',
        control: 'toggle',
        defaultValue: false,
    },
    'codex.show_raw_agent_reasoning': {
        driver: 'codex',
        group: 'privacy',
        path: 'show_raw_agent_reasoning',
        control: 'toggle',
        defaultValue: false,
    },
    'codex.file_opener': {
        driver: 'codex',
        group: 'ui',
        path: 'file_opener',
        control: 'select',
        options: ['none', 'vscode', 'vscode-insiders', 'windsurf', 'cursor'],
    },
    'codex.cli_auth_credentials_store': {
        driver: 'codex',
        group: 'runtime',
        path: 'cli_auth_credentials_store',
        control: 'select',
        options: ['file', 'keyring', 'auto', 'ephemeral'],
    },
    'codex.forced_login_method': {
        driver: 'codex',
        group: 'runtime',
        path: 'forced_login_method',
        control: 'select',
        options: ['chatgpt', 'api'],
    },
    'codex.service_tier': {
        driver: 'codex',
        group: 'runtime',
        path: 'service_tier',
        control: 'select',
        options: ['fast', 'flex'],
    },
    'codex.history.max_bytes': {
        driver: 'codex',
        group: 'memory',
        path: 'history.max_bytes',
        control: 'number',
    },
    'codex.tools.view_image': {
        driver: 'codex',
        group: 'tools',
        path: 'tools.view_image',
        control: 'toggle',
    },
    'claude.cleanupPeriodDays': {
        driver: 'claude',
        group: 'memory',
        path: 'cleanupPeriodDays',
        control: 'number',
    },
    'claude.autoMemoryEnabled': {
        driver: 'claude',
        group: 'memory',
        path: 'autoMemoryEnabled',
        control: 'toggle',
        defaultValue: true,
    },
    'claude.alwaysThinkingEnabled': {
        driver: 'claude',
        group: 'model',
        path: 'alwaysThinkingEnabled',
        control: 'toggle',
    },
    'claude.showThinkingSummaries': {
        driver: 'claude',
        group: 'model',
        path: 'showThinkingSummaries',
        control: 'toggle',
    },
    'claude.forceLoginMethod': {
        driver: 'claude',
        group: 'runtime',
        path: 'forceLoginMethod',
        control: 'select',
        options: ['claudeai', 'console'],
    },
    'claude.disableAllHooks': {
        driver: 'claude',
        group: 'tools',
        path: 'disableAllHooks',
        control: 'toggle',
        defaultValue: false,
    },
    'claude.skipWebFetchPreflight': {
        driver: 'claude',
        group: 'tools',
        path: 'skipWebFetchPreflight',
        control: 'toggle',
    },
    'claude.tui': {
        driver: 'claude',
        group: 'ui',
        path: 'tui',
        control: 'select',
        options: ['default', 'fullscreen'],
    },
    'claude.viewMode': {
        driver: 'claude',
        group: 'ui',
        path: 'viewMode',
        control: 'select',
        options: ['default', 'verbose', 'focus'],
    },
    'claude.verbose': {
        driver: 'claude',
        group: 'ui',
        path: 'verbose',
        control: 'toggle',
    },
    'claude.syntaxHighlightingDisabled': {
        driver: 'claude',
        group: 'ui',
        path: 'syntaxHighlightingDisabled',
        control: 'toggle',
    },
    'gemini.general.vimMode': {
        driver: 'gemini',
        group: 'ui',
        path: 'general.vimMode',
        control: 'toggle',
        defaultValue: false,
    },
    'gemini.output.format': {
        driver: 'gemini',
        group: 'runtime',
        path: 'output.format',
        control: 'select',
        defaultValue: 'text',
        options: ['text', 'json'],
    },
    'gemini.ui.inlineThinkingMode': {
        driver: 'gemini',
        group: 'ui',
        path: 'ui.inlineThinkingMode',
        control: 'select',
        defaultValue: 'off',
        options: ['off', 'full'],
    },
    'gemini.ui.footer.hideModelInfo': {
        driver: 'gemini',
        group: 'ui',
        path: 'ui.footer.hideModelInfo',
        control: 'toggle',
        defaultValue: false,
    },
    'gemini.ui.errorVerbosity': {
        driver: 'gemini',
        group: 'ui',
        path: 'ui.errorVerbosity',
        control: 'select',
        defaultValue: 'low',
        options: ['low', 'full'],
    },
    'gemini.ide.enabled': {
        driver: 'gemini',
        group: 'runtime',
        path: 'ide.enabled',
        control: 'toggle',
        defaultValue: false,
    },
    'gemini.billing.overageStrategy': {
        driver: 'gemini',
        group: 'runtime',
        path: 'billing.overageStrategy',
        control: 'select',
        defaultValue: 'ask',
        options: ['ask', 'always', 'never'],
    },
    'gemini.model.maxSessionTurns': {
        driver: 'gemini',
        group: 'model',
        path: 'model.maxSessionTurns',
        control: 'number',
        defaultValue: -1,
    },
    'gemini.model.compressionThreshold': {
        driver: 'gemini',
        group: 'memory',
        path: 'model.compressionThreshold',
        control: 'number',
        defaultValue: 0.5,
    },
    'gemini.context.fileFiltering.enableFuzzySearch': {
        driver: 'gemini',
        group: 'tools',
        path: 'context.fileFiltering.enableFuzzySearch',
        control: 'toggle',
        defaultValue: true,
    },
    'gemini.tools.sandboxAllowedPaths': {
        driver: 'gemini',
        group: 'safety',
        path: 'tools.sandboxAllowedPaths',
        control: 'list',
    },
    'gemini.tools.truncateToolOutputThreshold': {
        driver: 'gemini',
        group: 'tools',
        path: 'tools.truncateToolOutputThreshold',
        control: 'number',
        defaultValue: 40000,
    },
    'gemini.security.toolSandboxing': {
        driver: 'gemini',
        group: 'safety',
        path: 'security.toolSandboxing',
        control: 'toggle',
        defaultValue: false,
    },
    'gemini.advanced.ignoreLocalEnv': {
        driver: 'gemini',
        group: 'privacy',
        path: 'advanced.ignoreLocalEnv',
        control: 'toggle',
        defaultValue: false,
    },
    'pi.compaction.enabled': {
        driver: 'pi',
        group: 'memory',
        path: 'compaction.enabled',
        control: 'toggle',
        defaultValue: true,
    },
    'pi.compaction.reserveTokens': {
        driver: 'pi',
        group: 'memory',
        path: 'compaction.reserveTokens',
        control: 'number',
        defaultValue: 16384,
    },
    'pi.retry.enabled': {
        driver: 'pi',
        group: 'runtime',
        path: 'retry.enabled',
        control: 'toggle',
        defaultValue: true,
    },
    'pi.retry.provider.maxRetryDelayMs': {
        driver: 'pi',
        group: 'runtime',
        path: 'retry.provider.maxRetryDelayMs',
        control: 'number',
        defaultValue: 60000,
    },
    'pi.transport': {
        driver: 'pi',
        group: 'runtime',
        path: 'transport',
        control: 'select',
        defaultValue: 'sse',
        options: ['sse', 'websocket', 'auto'],
    },
    'pi.terminal.showImages': {
        driver: 'pi',
        group: 'ui',
        path: 'terminal.showImages',
        control: 'toggle',
        defaultValue: true,
    },
    'pi.images.blockImages': {
        driver: 'pi',
        group: 'privacy',
        path: 'images.blockImages',
        control: 'toggle',
        defaultValue: false,
    },
    'pi.shellPath': {
        driver: 'pi',
        group: 'tools',
        path: 'shellPath',
        control: 'text',
    },
    'pi.npmCommand': {
        driver: 'pi',
        group: 'tools',
        path: 'npmCommand',
        control: 'list',
    },
    'pi.sessionDir': {
        driver: 'pi',
        group: 'memory',
        path: 'sessionDir',
        control: 'text',
    },
    'copilot.deniedUrls': {
        driver: 'copilot',
        group: 'safety',
        path: 'deniedUrls',
        control: 'list',
    },
    'copilot.autoUpdatesChannel': {
        driver: 'copilot',
        group: 'runtime',
        path: 'autoUpdatesChannel',
        control: 'select',
        defaultValue: 'stable',
        options: ['stable', 'prerelease'],
    },
    'copilot.banner': {
        driver: 'copilot',
        group: 'ui',
        path: 'banner',
        control: 'select',
        defaultValue: 'once',
        options: ['always', 'once', 'never'],
    },
    'copilot.colorMode': {
        driver: 'copilot',
        group: 'ui',
        path: 'colorMode',
        control: 'select',
        defaultValue: 'default',
        options: ['default', 'dim', 'high-contrast', 'colorblind'],
    },
    'copilot.disabledMcpServers': {
        driver: 'copilot',
        group: 'tools',
        path: 'disabledMcpServers',
        control: 'list',
    },
    'copilot.enabledMcpServers': {
        driver: 'copilot',
        group: 'tools',
        path: 'enabledMcpServers',
        control: 'list',
    },
    'copilot.ide.autoConnect': {
        driver: 'copilot',
        group: 'runtime',
        path: 'ide.autoConnect',
        control: 'toggle',
        defaultValue: true,
    },
    'copilot.ide.openDiffOnEdit': {
        driver: 'copilot',
        group: 'ui',
        path: 'ide.openDiffOnEdit',
        control: 'toggle',
        defaultValue: true,
    },
    'copilot.logLevel': {
        driver: 'copilot',
        group: 'runtime',
        path: 'logLevel',
        control: 'select',
        defaultValue: 'default',
        options: ['default', 'error', 'warning', 'info', 'debug', 'all', 'none'],
    },
    'copilot.screenReader': {
        driver: 'copilot',
        group: 'ui',
        path: 'screenReader',
        control: 'toggle',
        defaultValue: false,
    },
    'copilot.updateTerminalTitle': {
        driver: 'copilot',
        group: 'ui',
        path: 'updateTerminalTitle',
        control: 'toggle',
        defaultValue: true,
    },
} as const satisfies Record<string, LatestFieldExpectation>

const latestFieldExpectations: Readonly<Record<string, LatestFieldExpectation>> = LATEST_FIELD_EXPECTATIONS
const fieldsById = new Map(AGENT_CONFIG_FIELDS.map((field) => [field.id, field]))

function hasDefaultValue(expectation: LatestFieldExpectation): boolean {
    return Object.prototype.hasOwnProperty.call(expectation, 'defaultValue')
}

describe('latest agent config catalog', () => {
    it('keeps every researched latest setting mapped to the writable config path', () => {
        for (const [id, expectation] of Object.entries(latestFieldExpectations)) {
            const field = fieldsById.get(id)
            expect(field, id).toBeDefined()
            expect(field).toMatchObject({
                driver: expectation.driver,
                group: expectation.group,
                path: expectation.path,
                control: expectation.control,
            })
            expect(field?.label.en.trim()).not.toBe('')
            expect(field?.label.zh.trim()).not.toBe('')
            expect(field?.help.en.trim()).not.toBe('')
            expect(field?.help.zh.trim()).not.toBe('')
        }
    })

    it('keeps latest select enums aligned with the known agent config choices', () => {
        for (const [id, expectation] of Object.entries(latestFieldExpectations)) {
            if (!expectation.options) continue
            const field = fieldsById.get(id)
            expect(field?.control, id).toBe('select')
            expect(field?.options?.map((option) => option.value)).toEqual(expectation.options)
        }
    })

    it('keeps latest defaults explicit where the upstream setting has a documented default', () => {
        for (const [id, expectation] of Object.entries(latestFieldExpectations)) {
            if (!hasDefaultValue(expectation)) continue
            expect(fieldsById.get(id)?.defaultValue, id).toEqual(expectation.defaultValue)
        }
    })
})
