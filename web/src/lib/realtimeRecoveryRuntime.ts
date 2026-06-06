import type { BrowserRecoveryForegroundReason } from '@/lib/browserRecoveryIntent'

export type RealtimeRecoveryRuntimeStatus = 'idle' | 'reconnecting' | 'syncing' | 'failed'
export type RealtimeRecoveryTrigger = 'socket-reconnect' | 'foreground' | 'page-restored' | 'user-retry'

export type RealtimeRecoveryRuntimeState = Readonly<{
    status: RealtimeRecoveryRuntimeStatus
    failure?: Readonly<{
        trigger: RealtimeRecoveryTrigger
        error: unknown
    }>
}>

type RealtimeConnectDetails = {
    initial: boolean
    recovered: boolean
    transport: string | null
}

type ForegroundPulse = {
    at: number
    reason: BrowserRecoveryForegroundReason
}

type RealtimeRecoveryRunner = (trigger: RealtimeRecoveryTrigger) => Promise<void>
type RealtimeRecoveryRuntimeListener = () => void

type RealtimeRecoveryRuntimeOptions = {
    runRecovery: RealtimeRecoveryRunner
    reportRecoveryError?: (trigger: RealtimeRecoveryTrigger, error: unknown) => void
    foregroundDedupeMs?: number
    now?: () => number
}

const IDLE_STATE: RealtimeRecoveryRuntimeState = { status: 'idle' }
const DEFAULT_FOREGROUND_DEDUPE_MS = 1_000

function isForegroundRecovery(reason: BrowserRecoveryForegroundReason): boolean {
    return reason === 'focus' || reason === 'visible' || reason === 'resume' || reason === 'network'
}

export class RealtimeRecoveryRuntime {
    private foregroundDedupeMs: number
    private hasConnected = false
    private inFlight: Promise<void> | null = null
    private socketConnected = false
    private lastForegroundRecoveryAt = Number.NEGATIVE_INFINITY
    private listeners = new Set<RealtimeRecoveryRuntimeListener>()
    private now: () => number
    private reportRecoveryError?: (trigger: RealtimeRecoveryTrigger, error: unknown) => void
    private runRecovery: RealtimeRecoveryRunner
    private state: RealtimeRecoveryRuntimeState = IDLE_STATE

    constructor(options: RealtimeRecoveryRuntimeOptions) {
        this.foregroundDedupeMs = options.foregroundDedupeMs ?? DEFAULT_FOREGROUND_DEDUPE_MS
        this.now = options.now ?? Date.now
        this.reportRecoveryError = options.reportRecoveryError
        this.runRecovery = options.runRecovery
    }

    getSnapshot = (): RealtimeRecoveryRuntimeState => this.state

    subscribe = (listener: RealtimeRecoveryRuntimeListener): (() => void) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    handleSocketConnect(details: RealtimeConnectDetails): Promise<void> | void {
        this.hasConnected = true
        this.socketConnected = true
        if (details.initial) {
            if (!this.inFlight) this.setState(IDLE_STATE)
            return
        }

        return this.startRecovery('socket-reconnect')
    }

    handleSocketDisconnect(): void {
        this.socketConnected = false
        if (!this.hasConnected || this.inFlight || this.state.status === 'failed') return
        this.setState({ status: 'reconnecting' })
    }

    handleSocketError(): void {
        this.socketConnected = false
        if (this.inFlight || this.state.status === 'failed') return
        this.setState({ status: 'reconnecting' })
    }

    handleForegroundPulse(pulse: ForegroundPulse): Promise<void> | void {
        if (pulse.reason === 'pageshow-restored') {
            return this.startRecovery('page-restored')
        }
        if (!isForegroundRecovery(pulse.reason)) return

        const now = this.now()
        if (now - this.lastForegroundRecoveryAt < this.foregroundDedupeMs) return
        this.lastForegroundRecoveryAt = now
        return this.startRecovery('foreground')
    }

    retry(): Promise<void> {
        return this.startRecovery('user-retry')
    }

    private startRecovery(trigger: RealtimeRecoveryTrigger): Promise<void> {
        if (this.inFlight) return this.inFlight

        this.setState({ status: 'syncing' })
        const task = Promise.resolve()
            .then(() => this.runRecovery(trigger))
            .then(() => {
                this.setState(this.hasConnected && !this.socketConnected ? { status: 'reconnecting' } : IDLE_STATE)
            })
            .catch((error: unknown) => {
                this.reportRecoveryError?.(trigger, error)
                this.setState({ status: 'failed', failure: { trigger, error } })
            })
            .finally(() => {
                this.inFlight = null
            })

        this.inFlight = task
        return task
    }

    private setState(state: RealtimeRecoveryRuntimeState): void {
        if (this.state === state || (this.state.status === state.status && this.state.failure === state.failure)) return
        this.state = state
        for (const listener of this.listeners) listener()
    }
}
