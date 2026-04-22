import type {
    InitializeParams,
    InitializeResponse,
    ThreadResumeParams,
    ThreadResumeResponse,
    ThreadStartParams,
    ThreadStartResponse,
    TurnInterruptParams,
    TurnInterruptResponse,
    TurnStartParams,
    TurnStartResponse,
} from './appServerTypes'
import { CodexAppServerBridge } from './codexAppServerBridge'
import type { RequestHandler } from './codexAppServerProtocol'

export class CodexAppServerClient {
    private readonly bridge = new CodexAppServerBridge()
    private initializedResponse: InitializeResponse | null = null
    private initializePromise: Promise<InitializeResponse> | null = null

    static readonly DEFAULT_TIMEOUT_MS = CodexAppServerBridge.DEFAULT_TIMEOUT_MS

    constructor() {
        this.bridge.setDisconnectHandler(() => {
            this.resetInitializationState()
        })
    }

    async connect(): Promise<void> {
        await this.bridge.connect()
    }

    setNotificationHandler(handler: ((method: string, params: unknown) => void) | null): void {
        this.bridge.setNotificationHandler(handler)
    }

    registerRequestHandler(method: string, handler: RequestHandler): void {
        this.bridge.registerRequestHandler(method, handler)
    }

    async initialize(params: InitializeParams): Promise<InitializeResponse> {
        if (this.initializedResponse) {
            return this.initializedResponse
        }
        if (this.initializePromise) {
            return await this.initializePromise
        }

        this.initializePromise = (async () => {
            const response = await this.bridge.sendRequest('initialize', params, { timeoutMs: 30_000 })
            this.bridge.sendNotification('initialized')
            this.initializedResponse = response as InitializeResponse
            return this.initializedResponse
        })()

        try {
            return await this.initializePromise
        } finally {
            if (!this.initializedResponse) {
                this.initializePromise = null
            }
        }
    }

    async startThread(params: ThreadStartParams, options?: { signal?: AbortSignal }): Promise<ThreadStartResponse> {
        return (await this.bridge.sendRequest('thread/start', params, {
            signal: options?.signal,
            timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS,
        })) as ThreadStartResponse
    }

    async resumeThread(params: ThreadResumeParams, options?: { signal?: AbortSignal }): Promise<ThreadResumeResponse> {
        return (await this.bridge.sendRequest('thread/resume', params, {
            signal: options?.signal,
            timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS,
        })) as ThreadResumeResponse
    }

    async startTurn(params: TurnStartParams, options?: { signal?: AbortSignal }): Promise<TurnStartResponse> {
        return (await this.bridge.sendRequest('turn/start', params, {
            signal: options?.signal,
            timeoutMs: CodexAppServerClient.DEFAULT_TIMEOUT_MS,
        })) as TurnStartResponse
    }

    async interruptTurn(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
        return (await this.bridge.sendRequest('turn/interrupt', params, {
            timeoutMs: 30_000,
        })) as TurnInterruptResponse
    }

    async disconnect(): Promise<void> {
        await this.bridge.disconnect()
        this.resetInitializationState()
    }

    private resetInitializationState(): void {
        this.initializedResponse = null
        this.initializePromise = null
    }
}
