/**
 * Main query implementation for Claude Code SDK
 * Handles spawning Claude process and managing message streams
 */

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Writable } from 'node:stream'
import { logger } from '@/ui/logger'
import { withBunRuntimeEnv } from '@/utils/bunRuntime'
import { killProcessByChildProcess } from '@/utils/process'
import { stripNewlinesForWindowsShellArg } from '@/utils/shellEscape'
import { appendMcpConfigArg } from '../utils/mcpConfig'
import { logQueryTaskError, Query } from './QueryRuntime'
import { AbortError, type CanCallToolCallback, type QueryOptions, type QueryPrompt, type SDKMessage } from './types'
import { getDefaultClaudeCodePath, logDebug, streamToStdin } from './utils'

const DEFAULT_PROMPT_FAILURE_CLEANUP_TIMEOUT_MS = 3_000

/**
 * Main query function to interact with Claude Code
 */
export function query(config: { prompt: QueryPrompt; options?: QueryOptions }): Query {
    const {
        prompt,
        options: {
            additionalDirectories = [],
            allowedTools = [],
            appendSystemPrompt,
            customSystemPrompt,
            cwd,
            disallowedTools = [],
            maxTurns,
            mcpServers,
            pathToClaudeCodeExecutable = getDefaultClaudeCodePath(),
            permissionMode = 'default',
            continue: continueConversation,
            resume,
            model,
            effort,
            fallbackModel,
            settingsPath,
            strictMcpConfig,
            canCallTool,
            includePartialMessages = false,
            promptFailureCleanupTimeoutMs = DEFAULT_PROMPT_FAILURE_CLEANUP_TIMEOUT_MS,
        } = {},
    } = config

    if (!process.env.CLAUDE_CODE_ENTRYPOINT) {
        process.env.CLAUDE_CODE_ENTRYPOINT = 'sdk-ts'
    }

    const args = ['--output-format', 'stream-json', '--verbose']
    let cleanupMcpConfig: (() => void) | null = null

    if (customSystemPrompt) args.push('--system-prompt', stripNewlinesForWindowsShellArg(customSystemPrompt))
    if (appendSystemPrompt) args.push('--append-system-prompt', stripNewlinesForWindowsShellArg(appendSystemPrompt))
    if (maxTurns) args.push('--max-turns', maxTurns.toString())
    if (model) args.push('--model', model)
    if (effort) args.push('--effort', effort)
    if (canCallTool) {
        if (typeof prompt === 'string') {
            throw new Error(
                'canCallTool callback requires --input-format stream-json. Please set prompt as an AsyncIterable.'
            )
        }
        args.push('--permission-prompt-tool', 'stdio')
    }
    if (continueConversation) args.push('--continue')
    if (resume) args.push('--resume', resume)
    if (settingsPath) args.push('--settings', settingsPath)
    if (allowedTools.length > 0) args.push('--allowedTools', allowedTools.join(','))
    if (disallowedTools.length > 0) args.push('--disallowedTools', disallowedTools.join(','))
    if (additionalDirectories.length > 0) args.push('--add-dir', ...additionalDirectories)
    if (strictMcpConfig) args.push('--strict-mcp-config')
    if (permissionMode) args.push('--permission-mode', permissionMode)
    if (includePartialMessages) args.push('--include-partial-messages')

    if (fallbackModel) {
        if (model && fallbackModel === model) {
            throw new Error(
                'Fallback model cannot be the same as the main model. Please specify a different model for fallbackModel option.'
            )
        }
        args.push('--fallback-model', fallbackModel)
    }

    if (typeof prompt === 'string') {
        args.push('--print', stripNewlinesForWindowsShellArg(prompt.trim()))
    } else {
        args.push('--input-format', 'stream-json')
    }

    const isCommandOnly = pathToClaudeCodeExecutable === 'claude'
    if (!isCommandOnly && !existsSync(pathToClaudeCodeExecutable)) {
        throw new ReferenceError(
            `Claude Code executable not found at ${pathToClaudeCodeExecutable}. Is options.pathToClaudeCodeExecutable set?`
        )
    }

    const spawnCommand = pathToClaudeCodeExecutable
    const spawnArgs = args

    cleanupMcpConfig = appendMcpConfigArg(spawnArgs, mcpServers)

    const spawnEnv = withBunRuntimeEnv(process.env, { allowBunBeBun: false })
    logDebug(`Spawning Claude Code process: ${spawnCommand} ${spawnArgs.join(' ')}`)

    const child = spawn(spawnCommand, spawnArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: config.options?.abort,
        env: spawnEnv,
        shell: false,
        windowsHide: process.platform === 'win32',
    }) as ChildProcessWithoutNullStreams

    let childStdin: Writable | null = null
    if (typeof prompt === 'string') {
        child.stdin.end()
    } else {
        childStdin = child.stdin
    }

    if (process.env.DEBUG) {
        child.stderr.on('data', (data) => {
            logger.warn('Claude Code stderr:', data.toString())
        })
    }

    let resolveExit!: () => void
    let rejectExit!: (error: Error) => void
    const processExitPromise = new Promise<void>((resolve, reject) => {
        resolveExit = resolve
        rejectExit = reject
    })

    let cleanupPromise: Promise<void> | null = null
    const cleanup = (): Promise<void> => {
        if (cleanupPromise) {
            return cleanupPromise
        }
        cleanupPromise = (async () => {
            await killProcessByChildProcess(child)
            child.stdin.destroy()
            child.stdout.destroy()
            child.stderr.destroy()
        })()
        return cleanupPromise
    }

    const handleAbort = () => {
        cleanup().catch((error) => {
            logQueryTaskError('abort cleanup failed', error)
        })
    }
    const handleProcessExit = () => {
        cleanup().catch((error) => {
            logQueryTaskError('process exit cleanup failed', error)
        })
    }
    config.options?.abort?.addEventListener('abort', handleAbort)
    process.on('exit', handleProcessExit)

    const queryInstance = new Query(childStdin, child.stdout, processExitPromise, canCallTool)

    if (typeof prompt !== 'string') {
        streamToStdin(prompt, child.stdin, config.options?.abort).catch(async (error) => {
            const promptError = error instanceof Error ? error : new Error(String(error))
            if (!queryInstance.registerPromptFailure(promptError)) {
                return
            }
            await Promise.race([
                cleanup(),
                new Promise<void>((resolve) => setTimeout(resolve, promptFailureCleanupTimeoutMs)),
            ])
            queryInstance.setError(promptError)
            rejectExit(promptError)
        })
    }

    child.on('close', (code) => {
        const promptFailure = queryInstance.getPromptFailure()
        if (promptFailure) {
            rejectExit(promptFailure)
            return
        }
        if (config.options?.abort?.aborted) {
            const error = new AbortError('Claude Code process aborted by user')
            queryInstance.setError(error)
            rejectExit(error)
            return
        }
        if (code !== 0) {
            const error = new Error(`Claude Code process exited with code ${code}`)
            queryInstance.setError(error)
            rejectExit(error)
            return
        }
        resolveExit()
    })

    child.on('error', (error) => {
        const promptFailure = queryInstance.getPromptFailure()
        if (promptFailure) {
            rejectExit(promptFailure)
            return
        }
        if (config.options?.abort?.aborted) {
            const abortError = new AbortError('Claude Code process aborted by user')
            queryInstance.setError(abortError)
            rejectExit(abortError)
            return
        }
        const spawnError = new Error(`Failed to spawn Claude Code process: ${error.message}`)
        queryInstance.setError(spawnError)
        rejectExit(spawnError)
    })

    processExitPromise
        .finally(() => {
            cleanup().catch((error) => {
                logQueryTaskError('final cleanup failed', error)
            })
            process.removeListener('exit', handleProcessExit)
            config.options?.abort?.removeEventListener('abort', handleAbort)
            if (process.env.CLAUDE_SDK_MCP_SERVERS) {
                delete process.env.CLAUDE_SDK_MCP_SERVERS
            }
            cleanupMcpConfig?.()
        })
        .catch((error) => {
            logQueryTaskError('process exit promise rejected', error)
        })

    return queryInstance
}
