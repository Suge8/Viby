import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Machine } from '../sync/syncEngine'

function resolveLocalVibyHomeDir(): string {
    return process.env.VIBY_HOME ? process.env.VIBY_HOME.replace(/^~/, homedir()) : join(homedir(), '.viby')
}

function matchesLocalRuntimeIdentity(metadata: { homeDir?: string; vibyHomeDir?: string }): boolean {
    return metadata.homeDir === homedir() && metadata.vibyHomeDir === resolveLocalVibyHomeDir()
}

function readLocalRuntimeIdentityMetadata(metadata: unknown): {
    homeDir?: string
    vibyHomeDir?: string
} | null {
    if (!metadata || typeof metadata !== 'object') {
        return null
    }

    const candidate = metadata as Record<string, unknown>
    const homeDir = typeof candidate.homeDir === 'string' ? candidate.homeDir : undefined
    const vibyHomeDir = typeof candidate.vibyHomeDir === 'string' ? candidate.vibyHomeDir : undefined
    return { homeDir, vibyHomeDir }
}

export function isLocalRuntimeRegistration(metadata: unknown): boolean {
    const runtimeMetadata = readLocalRuntimeIdentityMetadata(metadata)
    if (!runtimeMetadata) {
        return false
    }

    return matchesLocalRuntimeIdentity(runtimeMetadata)
}

export function isLocalRuntimeMachine(machine: Pick<Machine, 'metadata'>): boolean {
    if (!machine.metadata) {
        return false
    }

    return matchesLocalRuntimeIdentity(machine.metadata)
}

export function resolveLocalRuntime(machines: readonly Machine[]): Machine | null {
    const localMachines = machines.filter(isLocalRuntimeMachine)
    if (localMachines.length === 0) {
        return null
    }

    return (
        [...localMachines].sort((left, right) => {
            const activeDiff = Number(right.active) - Number(left.active)
            if (activeDiff !== 0) {
                return activeDiff
            }

            const activeAtDiff = right.activeAt - left.activeAt
            if (activeAtDiff !== 0) {
                return activeAtDiff
            }

            const updatedAtDiff = right.updatedAt - left.updatedAt
            if (updatedAtDiff !== 0) {
                return updatedAtDiff
            }

            return right.createdAt - left.createdAt
        })[0] ?? null
    )
}
