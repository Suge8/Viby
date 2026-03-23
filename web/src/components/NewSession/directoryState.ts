import type { SessionType } from './types'

interface DirectoryStateOptions {
    currentDirectoryExists: boolean | undefined
    directoryCreationConfirmed: boolean
    sessionType: SessionType
    trimmedDirectory: string
    t: (key: string) => string
}

export interface DirectoryState {
    createLabel?: string
    missingWorktreeDirectory: boolean
    statusMessage: string | null
    statusTone: 'error' | 'warning' | null
}

export function deriveDirectoryState(options: DirectoryStateOptions): DirectoryState {
    const { currentDirectoryExists, directoryCreationConfirmed, sessionType, trimmedDirectory, t } = options
    const missingWorktreeDirectory = sessionType === 'worktree' && trimmedDirectory !== '' && currentDirectoryExists === false
    const needsDirectoryCreationWarning = sessionType === 'simple' && trimmedDirectory !== '' && currentDirectoryExists === false
    let createLabel: string | undefined
    let statusMessage: string | null = null
    let statusTone: 'error' | 'warning' | null = null

    if (missingWorktreeDirectory) {
        statusMessage = t('session.directoryMissingWorktree')
        statusTone = 'error'
    } else if (needsDirectoryCreationWarning) {
        statusMessage = directoryCreationConfirmed
            ? t('session.directoryMissingSimpleConfirm')
            : t('session.directoryMissingSimple')
        statusTone = 'warning'
    }

    if (needsDirectoryCreationWarning && directoryCreationConfirmed) {
        createLabel = t('session.createAndCreateDirectory')
    }

    return {
        createLabel,
        missingWorktreeDirectory,
        statusMessage,
        statusTone
    }
}
