import {
    AGENT_FLAVORS,
    type AgentAvailability,
    type AgentAvailabilityResponse,
    type AgentFlavor,
    type AgentLaunchConfigErrorCode,
    type ListAgentAvailabilityRequest,
    type ResolveAgentLaunchConfigRequest,
    type ResolveAgentLaunchConfigResponse,
    type RuntimeCapabilityDepth,
    type RuntimeCapabilityError,
    type RuntimeCapabilityRequest,
    type RuntimeCapabilitySnapshot,
    type SyncEvent,
} from '@viby/protocol'
import { RuntimeCapabilityPendingRefreshes } from './runtimeCapabilityPending'
import {
    type AvailabilityValue,
    buildRuntimeCapabilitySnapshot,
    type LaunchConfigValue,
    pendingKey,
    type RuntimeScope,
} from './runtimeCapabilitySnapshot'
import {
    getRuntimeCapabilityErrorMessage,
    type RuntimeSpawnValidationOptions,
    type RuntimeSpawnValidationResult,
    rejectRuntimeCapability,
    validateRuntimeLaunchOptions,
} from './runtimeCapabilityValidation'

const AVAILABILITY_TTL_MS = 30_000
const LAUNCH_CONFIG_TTL_MS = 60_000
const ERROR_TTL_MS = 10_000

type RuntimeCapabilityRpc = {
    listAgentAvailability(machineId: string, request: ListAgentAvailabilityRequest): Promise<AgentAvailabilityResponse>
    resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse>
}

type RuntimeCapabilityEmitter = { emit(event: SyncEvent): void }

function normalizeDirectory(directory?: string | null): string | null {
    const trimmed = directory?.trim()
    return trimmed ? trimmed : null
}

function normalizeDrivers(drivers?: readonly AgentFlavor[]): AgentFlavor[] {
    return drivers?.length ? AGENT_FLAVORS.filter((driver) => drivers.includes(driver)) : [...AGENT_FLAVORS]
}

function isExpired(value: { expiresAt: number | null } | undefined, now: number): boolean {
    return !value?.expiresAt || value.expiresAt <= now
}

function createRuntimeError(code: RuntimeCapabilityError['code'], detectedAt: number): RuntimeCapabilityError {
    return { code, detectedAt }
}

function createUnavailableAvailability(driver: AgentFlavor, detectedAt: number): AgentAvailability {
    return { driver, status: 'unavailable', resolution: 'learn_more', code: 'unknown', detectedAt }
}

function toLaunchConfigResponseCode(code: RuntimeCapabilityError['code']): AgentLaunchConfigErrorCode {
    if (code === 'auth_missing' || code === 'config_missing' || code === 'provider_unavailable') return code
    if (code === 'model_unavailable' || code === 'reasoning_unsupported') return code
    return 'unknown'
}

export class RuntimeCapabilityCache {
    private readonly scopes = new Map<string, RuntimeScope>()
    private readonly pending = new RuntimeCapabilityPendingRefreshes()

    constructor(
        private readonly rpc: RuntimeCapabilityRpc,
        private readonly events: RuntimeCapabilityEmitter
    ) {}

    getSnapshot(machineId: string, request: RuntimeCapabilityRequest): RuntimeCapabilitySnapshot {
        const scope = this.getScope(machineId, request.directory)
        this.refresh(scope, normalizeDrivers(request.drivers), request.depth, request.forceRefresh === true)
        return this.buildSnapshot(scope)
    }

    async getAgentAvailability(
        machineId: string,
        request: ListAgentAvailabilityRequest
    ): Promise<AgentAvailabilityResponse> {
        const scope = this.getScope(machineId, request.directory)
        const drivers = normalizeDrivers(request.drivers)
        await Promise.all(
            drivers.map((driver) => this.refreshAvailability(scope, driver, request.forceRefresh === true))
        )
        return { agents: drivers.map((driver) => this.requireAvailability(scope, driver)) }
    }

    async resolveAgentLaunchConfig(
        machineId: string,
        request: ResolveAgentLaunchConfigRequest
    ): Promise<ResolveAgentLaunchConfigResponse> {
        const scope = this.getScope(machineId, request.directory)
        await this.refreshLaunchConfig(scope, request.agent, true)
        const launchConfig = scope.agents.get(request.agent)?.launchConfig
        const code = launchConfig?.error?.code ?? 'unknown'
        if (!launchConfig?.error && launchConfig?.config) return { type: 'success', config: launchConfig.config }
        return {
            type: 'error',
            code: toLaunchConfigResponseCode(code),
            message: getRuntimeCapabilityErrorMessage(code),
        }
    }

    async validateSpawn(
        machineId: string,
        options: RuntimeSpawnValidationOptions
    ): Promise<RuntimeSpawnValidationResult> {
        const scope = this.getScope(machineId, options.directory)
        await Promise.all([
            this.refreshAvailability(scope, options.agent, true),
            this.refreshLaunchConfig(scope, options.agent, true),
        ])
        const entry = scope.agents.get(options.agent)
        const availability = entry?.availability?.value ?? null
        if (entry?.availability?.error || availability?.status !== 'ready') {
            return rejectRuntimeCapability(
                'agent_unavailable',
                409,
                options.agent,
                availability,
                entry?.availability?.error?.code
            )
        }

        const launchConfig = entry?.launchConfig
        if (launchConfig?.error || !launchConfig?.config) {
            return rejectRuntimeCapability(
                'agent_config_unavailable',
                409,
                options.agent,
                availability,
                launchConfig?.error?.code
            )
        }
        return validateRuntimeLaunchOptions(options, launchConfig.config, availability)
    }

    private getScope(machineId: string, directory?: string | null): RuntimeScope {
        const normalizedDirectory = normalizeDirectory(directory)
        const key = `${machineId}\0${normalizedDirectory ?? ''}`
        let scope = this.scopes.get(key)
        if (!scope) {
            scope = { key, machineId, directory: normalizedDirectory, agents: new Map() }
            this.scopes.set(key, scope)
        }
        return scope
    }

    private refresh(
        scope: RuntimeScope,
        drivers: readonly AgentFlavor[],
        depth: RuntimeCapabilityDepth,
        forceRefresh: boolean
    ): void {
        for (const driver of drivers) {
            this.refreshAvailability(scope, driver, forceRefresh)
            if (depth === 'launch_config') this.refreshLaunchConfig(scope, driver, forceRefresh)
        }
    }

    private refreshAvailability(scope: RuntimeScope, driver: AgentFlavor, forceRefresh: boolean): Promise<void> {
        const now = Date.now()
        const current = scope.agents.get(driver)?.availability
        if (!forceRefresh && !isExpired(current, now)) return Promise.resolve()
        const key = pendingKey(scope, driver, 'availability')
        return this.pending.start(key, forceRefresh, () => this.runAvailabilityRefresh(scope, driver, forceRefresh))
    }

    private refreshLaunchConfig(scope: RuntimeScope, driver: AgentFlavor, forceRefresh: boolean): Promise<void> {
        const now = Date.now()
        const current = scope.agents.get(driver)?.launchConfig
        if (!forceRefresh && !isExpired(current, now)) return Promise.resolve()
        const key = pendingKey(scope, driver, 'launch_config')
        return this.pending.start(key, forceRefresh, () => this.runLaunchConfigRefresh(scope, driver))
    }

    private async runAvailabilityRefresh(
        scope: RuntimeScope,
        driver: AgentFlavor,
        forceRefresh: boolean
    ): Promise<void> {
        const detectedAt = Date.now()
        const previous = scope.agents.get(driver)?.availability
        try {
            const response = await this.rpc.listAgentAvailability(scope.machineId, {
                directory: scope.directory ?? undefined,
                forceRefresh,
                drivers: [driver],
            })
            const value = response.agents.find((agent) => agent.driver === driver)
            if (!value) throw new Error(`Missing ${driver} availability`)
            this.setAvailability(scope, driver, {
                driver,
                value,
                detectedAt,
                expiresAt: Date.now() + AVAILABILITY_TTL_MS,
                error: null,
            })
        } catch {
            this.setAvailability(scope, driver, {
                driver,
                value: previous?.value ?? createUnavailableAvailability(driver, detectedAt),
                detectedAt,
                expiresAt: Date.now() + ERROR_TTL_MS,
                error: createRuntimeError('rpc_unavailable', detectedAt),
            })
        }
    }

    private async runLaunchConfigRefresh(scope: RuntimeScope, driver: AgentFlavor): Promise<void> {
        const detectedAt = Date.now()
        const previous = scope.agents.get(driver)?.launchConfig
        try {
            const response = await this.rpc.resolveAgentLaunchConfig(scope.machineId, {
                agent: driver,
                directory: scope.directory ?? undefined,
            })
            const next =
                response.type === 'success'
                    ? { config: response.config, error: null, expiresAt: Date.now() + LAUNCH_CONFIG_TTL_MS }
                    : {
                          config: previous?.config ?? null,
                          error: createRuntimeError(response.code, detectedAt),
                          expiresAt: Date.now() + ERROR_TTL_MS,
                      }
            this.setLaunchConfig(scope, driver, { agent: driver, detectedAt, ...next })
        } catch {
            this.setLaunchConfig(scope, driver, {
                agent: driver,
                config: previous?.config ?? null,
                detectedAt,
                expiresAt: Date.now() + ERROR_TTL_MS,
                error: createRuntimeError('rpc_unavailable', detectedAt),
            })
        }
    }

    private setAvailability(scope: RuntimeScope, driver: AgentFlavor, availability: AvailabilityValue): void {
        const entry = scope.agents.get(driver) ?? {}
        entry.availability = availability
        scope.agents.set(driver, entry)
        this.emitUpdated(scope, driver)
    }

    private setLaunchConfig(scope: RuntimeScope, driver: AgentFlavor, launchConfig: LaunchConfigValue): void {
        const entry = scope.agents.get(driver) ?? {}
        entry.launchConfig = launchConfig
        scope.agents.set(driver, entry)
        this.emitUpdated(scope, driver)
    }

    private requireAvailability(scope: RuntimeScope, driver: AgentFlavor): AgentAvailability {
        const availability = scope.agents.get(driver)?.availability?.value
        if (!availability) throw new Error(`Agent availability unavailable for ${driver}`)
        return availability
    }

    private buildSnapshot(scope: RuntimeScope): RuntimeCapabilitySnapshot {
        return buildRuntimeCapabilitySnapshot(scope, (driver, kind) =>
            this.pending.has(pendingKey(scope, driver, kind))
        )
    }

    private emitUpdated(scope: RuntimeScope, driver: AgentFlavor): void {
        this.events.emit({
            type: 'runtime-capability-updated',
            machineId: scope.machineId,
            directory: scope.directory,
            drivers: [driver],
        })
    }
}
