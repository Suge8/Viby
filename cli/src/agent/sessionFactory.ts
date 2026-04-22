import { randomUUID } from 'node:crypto'
import os from 'node:os'
import { resolve } from 'node:path'
import type { SessionDriver } from '@viby/protocol'
import { getSessionDriverRuntimeHandles, MACHINE_BROWSE_DIRECTORY_CAPABILITY } from '@viby/protocol'
import { ApiClient } from '@/api/api'
import type { ApiSessionClient } from '@/api/apiSession'
import type {
    AgentState,
    MachineMetadata,
    Metadata,
    Session,
    SessionCollaborationMode,
    SessionModelReasoningEffort,
    SessionPermissionMode,
} from '@/api/types'
import { configuration } from '@/configuration'
import { readSettings } from '@/persistence'
import { runtimePath } from '@/projectPath'
import { notifyRunnerSessionStarted } from '@/runner/controlClient'
import { logger } from '@/ui/logger'
import { getInvokedCwd } from '@/utils/invokedCwd'
import { readWorktreeEnv } from '@/utils/worktreeEnv'
import packageJson from '../../package.json'

export type SessionStartedBy = 'runner' | 'terminal'

export type SessionBootstrapOptions = {
    driver: SessionDriver
    sessionId?: string
    startedBy?: SessionStartedBy
    driverSwitchBootstrap?: boolean
    workingDirectory?: string
    tag?: string
    agentState?: AgentState | null
    model?: string
    modelReasoningEffort?: SessionModelReasoningEffort
    permissionMode?: SessionPermissionMode
    collaborationMode?: SessionCollaborationMode
    metadataOverrides?: Partial<Metadata>
}

export type SessionBootstrapResult = {
    api: ApiClient
    session: ApiSessionClient
    sessionInfo: Session
    metadata: Metadata
    machineId: string
    startedBy: SessionStartedBy
    workingDirectory: string
}

export function buildMachineMetadata(): MachineMetadata {
    return {
        host: process.env.VIBY_HOSTNAME || os.hostname(),
        platform: os.platform(),
        vibyCliVersion: packageJson.version,
        capabilities: [MACHINE_BROWSE_DIRECTORY_CAPABILITY],
        homeDir: os.homedir(),
        vibyHomeDir: configuration.vibyHomeDir,
        vibyLibDir: runtimePath(),
    }
}

export function buildSessionMetadata(options: {
    driver: SessionDriver
    startedBy: SessionStartedBy
    workingDirectory: string
    machineId: string
    now?: number
    metadataOverrides?: Partial<Metadata>
}): Metadata {
    const vibyLibDir = runtimePath()
    const worktreeInfo = readWorktreeEnv()
    const now = options.now ?? Date.now()
    const metadataOverrides = options.metadataOverrides ?? {}

    return {
        path: options.workingDirectory,
        host: os.hostname(),
        version: packageJson.version,
        os: os.platform(),
        machineId: options.machineId,
        homeDir: os.homedir(),
        vibyHomeDir: configuration.vibyHomeDir,
        vibyLibDir,
        vibyToolsDir: resolve(vibyLibDir, 'tools', 'unpacked'),
        hostPid: process.pid,
        startedBy: options.startedBy,
        lifecycleState: 'running',
        lifecycleStateSince: now,
        ...metadataOverrides,
        driver: options.driver,
        worktree: metadataOverrides.worktree ?? worktreeInfo ?? undefined,
    }
}

function mergeBootstrapMetadata(current: Metadata | null, desired: Metadata): Metadata {
    const preservedRuntimeHandles = getSessionDriverRuntimeHandles(current)

    return {
        ...(current ?? {}),
        ...desired,
        ...(preservedRuntimeHandles ? { runtimeHandles: preservedRuntimeHandles } : {}),
    }
}

async function syncBootstrapMetadata(options: {
    session: ApiSessionClient
    desiredMetadata: Metadata
    sessionId?: string
    persist?: boolean
}): Promise<Metadata> {
    const currentMetadata = options.session.getMetadataSnapshot()
    const nextMetadata = mergeBootstrapMetadata(currentMetadata, options.desiredMetadata)
    if (options.persist === false || !options.sessionId) {
        return nextMetadata
    }
    if (JSON.stringify(currentMetadata) === JSON.stringify(nextMetadata)) {
        return currentMetadata ?? nextMetadata
    }

    await options.session.updateMetadataAndWait(() => nextMetadata, {
        touchUpdatedAt: false,
    })

    const syncedMetadata = options.session.getMetadataSnapshot()
    if (!syncedMetadata || syncedMetadata.driver !== nextMetadata.driver) {
        throw new Error(`Session bootstrap metadata sync failed for ${options.sessionId}`)
    }

    return syncedMetadata
}

function shouldRegisterBootstrapMachine(startedBy: SessionStartedBy): boolean {
    return startedBy !== 'runner'
}

function shouldPersistBootstrapMetadata(options: SessionBootstrapOptions): boolean {
    return Boolean(options.sessionId) && options.driverSwitchBootstrap !== true
}

async function getMachineIdOrExit(): Promise<string> {
    const injectedMachineId = process.env.VIBY_MACHINE_ID?.trim()
    if (injectedMachineId) {
        logger.debug(`Using injected machineId: ${injectedMachineId}`)
        return injectedMachineId
    }

    const settings = await readSettings()
    const machineId = settings?.machineId
    if (!machineId) {
        logger.warn(
            `[START] No machine ID found in settings, which is unexpected since authAndSetupMachineIfNeeded should have created it. Please report this issue on ${packageJson.bugs}`
        )
        process.exit(1)
    }
    logger.debug(`Using machineId: ${machineId}`)
    return machineId
}

async function reportSessionStarted(sessionId: string, metadata: Metadata): Promise<void> {
    try {
        logger.debug(`[START] Reporting session ${sessionId} to runner`)
        const result = await notifyRunnerSessionStarted(sessionId, metadata)
        if (result?.error) {
            logger.debug(`[START] Failed to report to runner (may not be running):`, result.error)
        } else {
            logger.debug(`[START] Reported session ${sessionId} to runner`)
        }
    } catch (error) {
        logger.debug('[START] Failed to report to runner (may not be running):', error)
    }
}

export async function bootstrapSession(options: SessionBootstrapOptions): Promise<SessionBootstrapResult> {
    const workingDirectory = options.workingDirectory ?? getInvokedCwd()
    const startedBy = options.startedBy ?? 'terminal'
    const sessionTag = options.tag ?? randomUUID()
    const agentState = options.agentState === undefined ? {} : options.agentState

    const [api, machineId] = await Promise.all([ApiClient.create(), getMachineIdOrExit()])
    if (shouldRegisterBootstrapMachine(startedBy)) {
        await api.getOrCreateMachine({
            machineId,
            metadata: buildMachineMetadata(),
        })
    }

    const metadata = buildSessionMetadata({
        driver: options.driver,
        startedBy,
        workingDirectory,
        machineId,
        metadataOverrides: options.metadataOverrides,
    })

    const sessionInfo = await api.getOrCreateSession({
        tag: sessionTag,
        sessionId: options.sessionId,
        metadata,
        state: agentState,
        model: options.model,
        modelReasoningEffort: options.modelReasoningEffort,
        permissionMode: options.permissionMode,
        collaborationMode: options.collaborationMode,
    })

    const session = api.sessionSyncClient(sessionInfo)
    const syncedMetadata = await syncBootstrapMetadata({
        session,
        desiredMetadata: metadata,
        sessionId: options.sessionId,
        persist: shouldPersistBootstrapMetadata(options),
    })

    await reportSessionStarted(sessionInfo.id, syncedMetadata)

    return {
        api,
        session,
        sessionInfo,
        metadata: syncedMetadata,
        machineId,
        startedBy,
        workingDirectory,
    }
}
