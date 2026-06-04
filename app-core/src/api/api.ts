import type { AxiosResponse } from 'axios'
import axios from 'axios'
import type { ZodType } from 'zod'
import { getAuthToken } from '@/api/auth'
import type {
    AgentState,
    CodexServiceTier,
    CreateMachineResponse,
    CreateSessionResponse,
    Machine,
    MachineMetadata,
    Metadata,
    RuntimeSessionRecoveryResponse,
    RuntimeState,
    Session,
} from '@/api/types'
import {
    AgentStateSchema,
    CreateMachineResponseSchema,
    CreateSessionResponseSchema,
    MachineMetadataSchema,
    MetadataSchema,
    RuntimeSessionRecoveryResponseSchema,
    RuntimeStateSchema,
} from '@/api/types'
import { configuration } from '@/configuration'
import { apiValidationError } from '@/utils/errorUtils'
import type { SessionCollaborationMode, SessionModelReasoningEffort, SessionPermissionMode } from './types'

export class ApiClient {
    static async create(): Promise<ApiClient> {
        return new ApiClient(getAuthToken())
    }

    private constructor(private readonly token: string) {}

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
            model: raw.model,
            modelReasoningEffort: raw.modelReasoningEffort,
            codexServiceTier: raw.codexServiceTier ?? null,
            permissionMode: raw.permissionMode,
            collaborationMode: raw.collaborationMode,
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
            runtimeState: this.parseNullable(raw.runtimeState, RuntimeStateSchema),
            runtimeStateVersion: raw.runtimeStateVersion,
        }
    }

    async getOrCreateSession(opts: {
        tag: string
        sessionId?: string
        metadata: Metadata
        state: AgentState | null
        model?: string
        modelReasoningEffort?: SessionModelReasoningEffort
        codexServiceTier?: CodexServiceTier | null
        permissionMode?: SessionPermissionMode
        collaborationMode?: SessionCollaborationMode
    }): Promise<Session> {
        const response = await axios.post<CreateSessionResponse>(
            `${configuration.apiUrl}/runtime/sessions`,
            {
                tag: opts.tag,
                sessionId: opts.sessionId,
                metadata: opts.metadata,
                agentState: opts.state,
                model: opts.model,
                modelReasoningEffort: opts.modelReasoningEffort,
                codexServiceTier: opts.codexServiceTier,
                permissionMode: opts.permissionMode,
                collaborationMode: opts.collaborationMode,
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60_000,
            }
        )

        const parsed = this.parseApiPayload(response, CreateSessionResponseSchema, 'Invalid /runtime/sessions response')
        return this.toSessionSnapshot(parsed.session)
    }

    async getOrCreateMachine(opts: {
        machineId: string
        metadata: MachineMetadata
        runtimeState?: RuntimeState
    }): Promise<Machine> {
        const response = await axios.post<CreateMachineResponse>(
            `${configuration.apiUrl}/runtime/machines`,
            {
                id: opts.machineId,
                metadata: opts.metadata,
                runtimeState: opts.runtimeState ?? null,
            },
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                timeout: 60_000,
            }
        )

        const parsed = this.parseApiPayload(response, CreateMachineResponseSchema, 'Invalid /runtime/machines response')
        return this.toMachineSnapshot(parsed.machine)
    }

    async getSessionRecoveryPage(opts: {
        sessionId: string
        afterSeq?: number
        limit?: number
    }): Promise<RuntimeSessionRecoveryResponse> {
        const response = await axios.get<RuntimeSessionRecoveryResponse>(
            `${configuration.apiUrl}/runtime/sessions/${encodeURIComponent(opts.sessionId)}/recovery`,
            {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                },
                params: {
                    afterSeq: opts.afterSeq ?? 0,
                    limit: opts.limit,
                },
                timeout: 60_000,
            }
        )

        return this.parseApiPayload(
            response,
            RuntimeSessionRecoveryResponseSchema,
            'Invalid /runtime/sessions/:id/recovery response'
        )
    }
}
