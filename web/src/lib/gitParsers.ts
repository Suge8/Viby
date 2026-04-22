import { createDiffStatsMap, type DiffSummary, parseNumStat } from '@/lib/gitDiffSummaryParser'
import {
    type GitFileEntryV2,
    type GitStatusSummaryV2,
    getCurrentBranchV2,
    parseStatusSummaryV2,
} from '@/lib/gitStatusSummaryParser'
import type { GitFileStatus, GitStatusFiles } from '@/types/api'

export type { DiffFileStat } from '@/lib/gitDiffSummaryParser'
export type { GitBranchInfo } from '@/lib/gitStatusSummaryParser'
export type { DiffSummary, GitFileEntryV2, GitStatusSummaryV2 }

export function buildGitStatusFiles(
    statusOutput: string,
    unstagedDiffOutput: string,
    stagedDiffOutput: string
): GitStatusFiles {
    const statusSummary = parseStatusSummaryV2(statusOutput)
    const branchName = getCurrentBranchV2(statusSummary)

    const unstagedDiff = parseNumStat(unstagedDiffOutput)
    const stagedDiff = parseNumStat(stagedDiffOutput)
    const unstagedStats = createDiffStatsMap(unstagedDiff)
    const stagedStats = createDiffStatsMap(stagedDiff)

    const stagedFiles: GitFileStatus[] = []
    const unstagedFiles: GitFileStatus[] = []

    for (const file of statusSummary.files) {
        const parts = file.path.split('/')
        const fileName = parts[parts.length - 1] || file.path
        const filePath = parts.slice(0, -1).join('/')

        if (file.index !== ' ' && file.index !== '.' && file.index !== '?') {
            const status = getFileStatus(file.index)
            const stats = stagedStats[file.path] ?? { added: 0, removed: 0, binary: false }
            stagedFiles.push({
                fileName,
                filePath,
                fullPath: file.path,
                status,
                isStaged: true,
                linesAdded: stats.added,
                linesRemoved: stats.removed,
                oldPath: file.from,
            })
        }

        if (file.workingDir !== ' ' && file.workingDir !== '.') {
            const status = getFileStatus(file.workingDir)
            const stats = unstagedStats[file.path] ?? { added: 0, removed: 0, binary: false }
            unstagedFiles.push({
                fileName,
                filePath,
                fullPath: file.path,
                status,
                isStaged: false,
                linesAdded: stats.added,
                linesRemoved: stats.removed,
                oldPath: file.from,
            })
        }
    }

    for (const untrackedPath of statusSummary.notAdded) {
        const cleanPath = untrackedPath.endsWith('/') ? untrackedPath.slice(0, -1) : untrackedPath
        const parts = cleanPath.split('/')
        const fileName = parts[parts.length - 1] || cleanPath
        const filePath = parts.slice(0, -1).join('/')

        if (untrackedPath.endsWith('/')) {
            continue
        }

        unstagedFiles.push({
            fileName,
            filePath,
            fullPath: cleanPath,
            status: 'untracked',
            isStaged: false,
            linesAdded: 0,
            linesRemoved: 0,
        })
    }

    return {
        stagedFiles,
        unstagedFiles,
        branch: branchName,
        totalStaged: stagedFiles.length,
        totalUnstaged: unstagedFiles.length,
    }
}

function getFileStatus(statusChar: string): GitFileStatus['status'] {
    switch (statusChar) {
        case 'M':
            return 'modified'
        case 'A':
            return 'added'
        case 'D':
            return 'deleted'
        case 'R':
        case 'C':
            return 'renamed'
        case '?':
            return 'untracked'
        case 'U':
            return 'conflicted'
        default:
            return 'modified'
    }
}
