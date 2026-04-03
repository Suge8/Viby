import axios from 'axios'
import type { AxiosResponse } from 'axios'
import type { ZodType } from 'zod'
import type {
    AgentState,
    CliSessionRecoveryResponse,
    CreateMachineResponse,
    CreateSessionResponse,
    RunnerState,
    Machine,
    MachineMetadata,
    Metadata,
    Session
} from '@/api/types'
import {
    AgentStateSchema,
    CliSessionRecoveryResponseSchema,
    CreateMachineResponseSchema,
    CreateSessionResponseSchema,
    RunnerStateSchema,
    MachineMetadataSchema,
    MetadataSchema
} from '@/api/types'
import { configuration } from '@/configuration'
import { getAuthToken } from '@/api/auth'
import { apiValidationError } from '@/utils/errorUtils'
import { ApiMachineClient, type ApiMachineClientOptions } from './apiMachine'
import { ApiSessionClient } from './apiSession'
import type {
    SessionCollaborationMode,
    SessionModelReasoningEffort,
    SessionPermissionMode,
    TeamSessionSpawnRole
} from './types'

export class ApiClient {
    static async create(): Promise<ApiClient> {
        return new ApiClient(getAuthToken())
    }

    private constructor(private readonly token: string) { }

    private parseApiPayload<T>(response: AxiosResponse, schema: ZodType<T>, errorMessage: string): T {
        const parsed = schema.safeParse(response.data)
        if (!parsed.success) {
            throw apiValidationError(errorMessage, response)
        }
        return parsed.data
    }

    private parseNullable<T>(value: unknown, schema: ZodType<T>): T | null {
        if (value == null) {
            return null
        }

        const parsed = schema.safeParse(value)
        return parsed.success ? parsed.data : null
    }

    private toSessionSnapshot(raw: CreateSessionResponse['session']): Session {
        return {
            id: raw.id,
            seq: raw.seq,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            active: raw.active,
            activeAt: raw.activeAt,
            metadata: this.parseNullable(raw.metadata, MetadataSchema),
            metadataVersion: raw.metadataVersion,
            agentState: this.parseNullable(raw.agentState, AgentStateSchema),
            agentStateVersion: raw.agentStateVersion,
            thinking: raw.thinking,
            thinkingAt: raw.thinkingAt,
            todos: raw.todos,
            teamContext: raw.teamContext,
            model: raw.model,
            modelReasoningEffort: raw.modelReasoningEffort,
            permissionMode: raw.permissionMode,
            collaborationMode: raw.collaborationMode
        }
    }

    private toMachineSnapshot(raw: CreateMachineResponse['machine']): Machine {
        return {
            id: raw.id,
            seq: raw.seq,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            active: raw.active,
            activeAt: raw.activeAt,
            metadata: this.parseNullable(raw.metadata, MachineMetadataSchema),
            metadataVersion: raw.metadataVersion,
            runnerState: this.parseNullable(raw.runnerState, RunnerStateSchema),
            runnerStateVersion: raw.runnerStateVersion
        }
    }

    async getOrCreateSession(opts: {
        tag: string
        sessionId?: string
        metadata: Metadata
        state: AgentState | null
        model?: string
        modelReasoningEffort?: SessionModelReasoningEffort
        permissionMode?: SessionPermissionMode
        sessionRole?: TeamSessionSpawnRole
        collaborationMode?: SessionCollaborationMode
    }): Promise<Session> {
        const response = await axios.post<CreateSessionResponse>(
            `${configuration.apiUrl}/cli/sessions`,
            {
                tag: opts.tag,
                sessionId: opts.sessionId,
                metadata: opts.metadata,
                agentState: opts.state,
                model: opts.model,
                modelReasoningEffort: opts.modelReasoningEffort,
                permissionMode: opts.permissionMode,
                sessionRole: opts.sessionRole,
                collaborationMode: opts.collaborationMode
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60_000
            }
        )

        const parsed = this.parseApiPayload(
            response,
            CreateSessionResponseSchema,
            'Invalid /cli/sessions response'
        )
        return this.toSessionSnapshot(parsed.session)
    }

    async getOrCreateMachine(opts: {
        machineId: string
        metadata: MachineMetadata
        runnerState?: RunnerState
    }): Promise<Machine> {
        const response = await axios.post<CreateMachineResponse>(
            `${configuration.apiUrl}/cli/machines`,
            {
                id: opts.machineId,
                metadata: opts.metadata,
                runnerState: opts.runnerState ?? null
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60_000
            }
        )

        const parsed = this.parseApiPayload(
            response,
            CreateMachineResponseSchema,
            'Invalid /cli/machines response'
        )
        return this.toMachineSnapshot(parsed.machine)
    }

    async getSessionRecoveryPage(opts: {
        sessionId: string
        afterSeq?: number
        limit?: number
    }): Promise<CliSessionRecoveryResponse> {
        const response = await axios.get<CliSessionRecoveryResponse>(
            `${configuration.apiUrl}/cli/sessions/${encodeURIComponent(opts.sessionId)}/recovery`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                params: {
                    afterSeq: opts.afterSeq ?? 0,
                    limit: opts.limit
                },
                timeout: 60_000
            }
        )

        return this.parseApiPayload(
            response,
            CliSessionRecoveryResponseSchema,
            'Invalid /cli/sessions/:id/recovery response'
        )
    }

    sessionSyncClient(session: Session): ApiSessionClient {
        return new ApiSessionClient(this.token, session)
    }

    machineSyncClient(machine: Machine, options?: ApiMachineClientOptions): ApiMachineClient {
        return new ApiMachineClient(this.token, machine, options)
    }
}
