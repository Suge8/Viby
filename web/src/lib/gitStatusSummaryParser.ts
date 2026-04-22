export type GitFileEntryV2 = {
    path: string
    index: string
    workingDir: string
    from?: string
}

export type GitBranchInfo = {
    oid?: string
    head?: string
    upstream?: string
    ahead?: number
    behind?: number
}

export type GitStatusSummaryV2 = {
    files: GitFileEntryV2[]
    notAdded: string[]
    ignored: string[]
    branch: GitBranchInfo
}

const BRANCH_OID_REGEX = /^# branch\.oid (.+)$/
const BRANCH_HEAD_REGEX = /^# branch\.head (.+)$/
const BRANCH_UPSTREAM_REGEX = /^# branch\.upstream (.+)$/
const BRANCH_AB_REGEX = /^# branch\.ab \+(\d+) -(\d+)$/
const ORDINARY_CHANGE_REGEX = /^1 (.)(.) (.{4}) (\d{6}) (\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) (.+)$/
const RENAME_COPY_REGEX = /^2 (.)(.) (.{4}) (\d{6}) (\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([RC])(\d{1,3}) (.+)\t(.+)$/
const UNMERGED_REGEX = /^u (.)(.) (.{4}) (\d{6}) (\d{6}) (\d{6}) (\d{6}) ([0-9a-f]+) ([0-9a-f]+) ([0-9a-f]+) (.+)$/
const UNTRACKED_REGEX = /^\? (.+)$/
const IGNORED_REGEX = /^! (.+)$/

export function parseStatusSummaryV2(statusOutput: string): GitStatusSummaryV2 {
    const lines = statusOutput
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
    const result: GitStatusSummaryV2 = {
        files: [],
        notAdded: [],
        ignored: [],
        branch: {},
    }

    for (const line of lines) {
        if (line.startsWith('# branch.oid ')) {
            const match = BRANCH_OID_REGEX.exec(line)
            if (match) {
                result.branch.oid = match[1]
            }
            continue
        }
        if (line.startsWith('# branch.head ')) {
            const match = BRANCH_HEAD_REGEX.exec(line)
            if (match) {
                result.branch.head = match[1]
            }
            continue
        }
        if (line.startsWith('# branch.upstream ')) {
            const match = BRANCH_UPSTREAM_REGEX.exec(line)
            if (match) {
                result.branch.upstream = match[1]
            }
            continue
        }
        if (line.startsWith('# branch.ab ')) {
            const match = BRANCH_AB_REGEX.exec(line)
            if (match) {
                result.branch.ahead = parseInt(match[1], 10)
                result.branch.behind = parseInt(match[2], 10)
            }
            continue
        }

        const fileEntry = parseStatusFileLine(line)
        if (fileEntry) {
            result.files.push(fileEntry)
            continue
        }

        const untrackedMatch = UNTRACKED_REGEX.exec(line)
        if (untrackedMatch) {
            result.notAdded.push(untrackedMatch[1])
            continue
        }

        const ignoredMatch = IGNORED_REGEX.exec(line)
        if (ignoredMatch) {
            result.ignored.push(ignoredMatch[1])
        }
    }

    return result
}

export function getCurrentBranchV2(summary: GitStatusSummaryV2): string | null {
    const head = summary.branch.head
    if (!head || head === '(detached)' || head === '(initial)') {
        return null
    }
    return head
}

function parseStatusFileLine(line: string): GitFileEntryV2 | null {
    if (line.startsWith('1 ')) {
        const match = ORDINARY_CHANGE_REGEX.exec(line)
        return match ? parseOrdinaryChange(match) : null
    }
    if (line.startsWith('2 ')) {
        const match = RENAME_COPY_REGEX.exec(line)
        return match ? parseRenameCopy(match) : null
    }
    if (line.startsWith('u ')) {
        const match = UNMERGED_REGEX.exec(line)
        return match ? parseUnmerged(match) : null
    }
    return null
}

function parseOrdinaryChange(matches: string[]): GitFileEntryV2 | null {
    if (!matches[1] || !matches[2] || !matches[9]) {
        return null
    }
    return {
        index: matches[1],
        workingDir: matches[2],
        path: matches[9],
    }
}

function parseRenameCopy(matches: string[]): GitFileEntryV2 | null {
    if (!matches[1] || !matches[2] || !matches[11] || !matches[12]) {
        return null
    }
    return {
        index: matches[1],
        workingDir: matches[2],
        from: matches[11],
        path: matches[12],
    }
}

function parseUnmerged(matches: string[]): GitFileEntryV2 | null {
    if (!matches[1] || !matches[2] || !matches[11]) {
        return null
    }
    return {
        index: matches[1],
        workingDir: matches[2],
        path: matches[11],
    }
}
