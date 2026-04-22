import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { flushReadyStateBeforeReady } from '@/agent/emitReadyIfIdle'
import { convertAgentMessage } from '@/agent/messageConverter'
import { mergePromptSegments, prependPromptInstructionsToMessage } from '@/agent/promptInstructions'
import { createReadyEventScheduler } from '@/agent/readyEventScheduler'
import { reportDiscoveredSessionId } from '@/agent/sessionDiscoveryBridge'
import { settleTerminalTurn } from '@/agent/turnTerminalSettlement'
import { RemoteLauncherBase, type RemoteLauncherExitReason } from '@/modules/common/remote/RemoteLauncherBase'
import { logger } from '@/ui/logger'
import {
    type CursorProcessResult,
    getCursorTerminalFailureError,
    surfaceCursorTerminalFailure,
} from './cursorTerminalFailure'
import type { CursorSession } from './session'
import { getDefaultCursorAgentCommand } from './utils/cursorAgentCommand'
import { buildCursorProcessEnv, ensureCursorConfig } from './utils/cursorConfig'
import { convertCursorEventToAgentMessage, parseCursorEvent } from './utils/cursorEventConverter'

function buildAgentArgs(opts: {
    message: string
    cwd: string
    sessionId: string | null
    mode?: string
    model?: string
    yolo?: boolean
}): string[] {
    const args = ['-p', opts.message, '--output-format', 'stream-json', '--trust', '--workspace', opts.cwd]

    if (opts.sessionId) {
        args.push('--resume', opts.sessionId)
    }
    if (opts.mode && (opts.mode === 'plan' || opts.mode === 'ask')) {
        args.push('--mode', opts.mode)
    }
    if (opts.model) {
        args.push('--model', opts.model)
    }
    if (opts.yolo) {
        args.push('--yolo')
    }

    return args
}

function permissionModeToAgentArgs(mode?: string): { mode?: string; yolo?: boolean } {
    if (mode === 'plan') return { mode: 'plan' }
    if (mode === 'ask') return { mode: 'ask' }
    if (mode === 'yolo') return { yolo: true }
    return {}
}

class CursorRemoteLauncher extends RemoteLauncherBase {
    private readonly session: CursorSession
    private abortController = new AbortController()
    private displayPermissionMode: string | null = null

    constructor(session: CursorSession) {
        super(process.env.DEBUG ? session.logPath : undefined)
        this.session = session
        this.session.setRuntimeStopHandler(() => this.requestStop())
    }

    public async launch(): Promise<RemoteLauncherExitReason> {
        return this.start()
    }

    protected async abortForStop(): Promise<void> {
        await this.handleAbort()
    }

    protected async runMainLoop(): Promise<void> {
        const session = this.session
        const messageBuffer = this.messageBuffer
        const bridge = await session.ensureRemoteBridge()
        const { configDir } = ensureCursorConfig(session.client.sessionId, bridge.mcpServers.viby)
        const processEnv = buildCursorProcessEnv(configDir)

        this.setupAbortHandlers(session.client.rpcHandlerManager, {
            onAbort: () => this.handleAbort(),
        })

        const sendReady = () => {
            session.sendSessionEvent({ type: 'ready' })
        }
        const readyScheduler = createReadyEventScheduler({
            label: '[cursor-remote]',
            queueSize: () => session.queue.size(),
            shouldExit: () => this.shouldExit,
            flushBeforeReady: () => flushReadyStateBeforeReady(session.client),
            sendReady,
        })

        let cursorSessionId: string | null = session.sessionId

        while (!this.shouldExit) {
            const waitSignal = this.abortController.signal
            const batch = await session.queue.waitForMessagesAndGetAsString(waitSignal)
            if (!batch) {
                if (waitSignal.aborted && !this.shouldExit) {
                    continue
                }
                break
            }

            const { message, mode } = batch
            const { mode: agentMode, yolo } = permissionModeToAgentArgs(mode.permissionMode as string)
            this.applyDisplayMode(mode.permissionMode as string)
            messageBuffer.addMessage(message, 'user')
            const messageInstructions = (() => {
                return mergePromptSegments(mode.developerInstructions)
            })()
            const messageText = prependPromptInstructionsToMessage(message, messageInstructions)

            const args = buildAgentArgs({
                message: messageText,
                cwd: session.path,
                sessionId: cursorSessionId,
                mode: agentMode,
                model: session.model,
                yolo,
            })

            logger.debug(`[cursor-remote] Spawning agent with args: ${args.join(' ')}`)

            session.onThinkingChange(true)

            try {
                const processResult = await this.runAgentProcess(args, session.path, processEnv, (event) => {
                    if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
                        cursorSessionId = event.session_id
                        reportDiscoveredSessionId(session.onSessionFound, event.session_id)
                    } else if (event.type === 'thinking') {
                        if (event.subtype === 'completed') {
                            // keep thinking until we get assistant/result
                        }
                    } else if (event.type === 'assistant' || event.type === 'tool_call' || event.type === 'result') {
                        const agentMsg = convertCursorEventToAgentMessage(event)
                        if (agentMsg) {
                            const codexMsg = convertAgentMessage(agentMsg)
                            if (codexMsg) {
                                session.sendCodexMessage(codexMsg)
                            }
                            switch (agentMsg.type) {
                                case 'text':
                                    messageBuffer.addMessage(agentMsg.text, 'assistant')
                                    break
                                case 'tool_call':
                                    messageBuffer.addMessage(`Tool: ${agentMsg.name}`, 'tool')
                                    break
                                case 'tool_result':
                                    messageBuffer.addMessage('Tool result', 'result')
                                    break
                                case 'turn_complete':
                                    break
                                default:
                                    break
                            }
                        }
                    }
                })

                if (processResult.aborted) {
                    continue
                }
                const processError = getCursorTerminalFailureError(processResult)
                if (processError) {
                    logger.debug('[cursor-remote] Agent exited before completion', processError)
                    surfaceCursorTerminalFailure({ session, messageBuffer, error: processError })
                }
            } catch (error) {
                logger.warn('[cursor-remote] Agent run failed', error)
                surfaceCursorTerminalFailure({ session, messageBuffer, error })
            } finally {
                await settleTerminalTurn({
                    setThinking: (thinking) => session.onThinkingChange(thinking),
                    emitReady: async () => await readyScheduler.emitNow(),
                })
            }
        }

        readyScheduler.dispose()
    }

    private runAgentProcess(
        args: string[],
        cwd: string,
        env: NodeJS.ProcessEnv,
        onEvent: (event: ReturnType<typeof parseCursorEvent> & object) => void
    ): Promise<CursorProcessResult> {
        return new Promise((resolve, reject) => {
            const child = spawn(getDefaultCursorAgentCommand(), args, {
                cwd,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: process.platform === 'win32',
            })

            let settled = false
            const resolveOnce = (result: CursorProcessResult) => {
                if (settled) {
                    return
                }
                settled = true
                resolve(result)
            }
            const rejectOnce = (error: Error) => {
                if (settled) {
                    return
                }
                settled = true
                reject(error)
            }

            const cleanup = () => {
                this.abortController.signal.removeEventListener('abort', abortHandler)
            }

            const abortHandler = () => {
                try {
                    child.kill('SIGTERM')
                } catch {
                    // ignore
                }
                cleanup()
                resolveOnce({ code: null, signal: null, aborted: true })
            }
            this.abortController.signal.addEventListener('abort', abortHandler)

            child.on('error', (err) => {
                cleanup()
                rejectOnce(err instanceof Error ? err : new Error(String(err)))
            })

            child.on('exit', (code, signal) => {
                cleanup()
                resolveOnce({ code, signal, aborted: false })
            })

            const rl = createInterface({ input: child.stdout, crlfDelay: Infinity })
            rl.on('line', (line) => {
                const event = parseCursorEvent(line)
                if (event) {
                    onEvent(event)
                }
            })

            child.stderr?.on('data', (chunk) => {
                const text = chunk.toString()
                if (text.trim()) {
                    logger.debug('[cursor-remote] agent stderr:', text.trim())
                }
            })
        })
    }

    private applyDisplayMode(permissionMode: string | undefined): void {
        if (permissionMode && permissionMode !== this.displayPermissionMode) {
            this.displayPermissionMode = permissionMode
            this.messageBuffer.addMessage(`[MODE:${permissionMode}]`, 'system')
        }
    }

    protected async cleanup(): Promise<void> {
        this.clearAbortHandlers(this.session.client.rpcHandlerManager)
        this.session.setRuntimeStopHandler(null)
        this.abortController.abort()
    }

    private async handleAbort(): Promise<void> {
        this.session.queue.reset()
        this.session.onThinkingChange(false)
        this.abortController.abort()
        this.abortController = new AbortController()
        this.messageBuffer.addMessage('Turn aborted', 'status')
    }
}

export async function cursorRemoteLauncher(session: CursorSession): Promise<RemoteLauncherExitReason> {
    const launcher = new CursorRemoteLauncher(session)
    return launcher.launch()
}
