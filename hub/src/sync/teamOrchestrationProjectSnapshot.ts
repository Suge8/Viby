import type { TeamProjectSnapshot } from '@viby/protocol/types'
import type { Store } from '../store'
import { TeamOrchestrationError } from './teamOrchestrationContracts'
import { buildTeamProjectSnapshot } from './teamProjectSnapshotBuilder'

function requireProjectSnapshot(store: Store, projectId: string): TeamProjectSnapshot {
    const snapshot = buildTeamProjectSnapshot(store, projectId)
    if (!snapshot) {
        throw new TeamOrchestrationError('Team project not found', 'team_project_not_found', 404)
    }

    return snapshot
}

export function requireProjectOwnedByManagerSnapshot(
    store: Store,
    projectId: string,
    managerSessionId: string,
): TeamProjectSnapshot {
    const snapshot = requireProjectSnapshot(store, projectId)
    if (snapshot.project.managerSessionId !== managerSessionId) {
        throw new TeamOrchestrationError(
            'Manager session does not own this team project',
            'team_manager_mismatch',
            409,
        )
    }

    return snapshot
}

export function requireActiveProjectOwnedByManagerSnapshot(
    store: Store,
    projectId: string,
    managerSessionId: string,
): TeamProjectSnapshot {
    const snapshot = requireProjectOwnedByManagerSnapshot(store, projectId, managerSessionId)
    if (snapshot.project.status !== 'active') {
        throw new TeamOrchestrationError(
            'Team project is not active',
            'team_project_inactive',
            409,
        )
    }

    return snapshot
}
