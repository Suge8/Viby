export type UpstreamLedgerConfig = {
    schemaVersion: 1
    repo: string
    upstream: {
        remote: string
        branch: string
        repository: string
    }
    forkPoint: {
        commit: string | null
        label: string
        confidence: 'low' | 'medium' | 'high'
        notes: string
    }
    audit: {
        lastAuditedCommit: string | null
        auditedRange: string
        auditDate: string | null
        strategy: string
    }
}

export const LEDGER_CONFIG_START = '<!-- upstream-lane:config:start -->'
export const LEDGER_CONFIG_END = '<!-- upstream-lane:config:end -->'
export const LEDGER_SNAPSHOT_START = '<!-- upstream-lane:snapshot:start -->'
export const LEDGER_SNAPSHOT_END = '<!-- upstream-lane:snapshot:end -->'

const DEFAULT_STRATEGY =
    '只吸收能提升 owner 清晰度、可靠性、性能或维护性的改动；拒绝削弱审批边界、引入双实现或扩大兼容债务的提交。'

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractMarkedJson(markdown: string): string {
    const blockRe = new RegExp(
        `${escapeRegExp(LEDGER_CONFIG_START)}\\s*\\n\`\`\`json\\s*\\n([\\s\\S]*?)\\n\`\`\`\\s*\\n${escapeRegExp(LEDGER_CONFIG_END)}`
    )
    const match = markdown.match(blockRe)
    if (!match?.[1]) {
        throw new Error('missing upstream ledger config block')
    }
    return match[1]
}

function replaceMarkedBlock(markdown: string, start: string, end: string, body: string): string {
    const blockRe = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`)
    if (!blockRe.test(markdown)) {
        throw new Error(`missing marked block: ${start}`)
    }
    return markdown.replace(blockRe, `${start}\n${body.trimEnd()}\n${end}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

export function hasLedgerMarkers(markdown: string): boolean {
    return (
        markdown.includes(LEDGER_CONFIG_START) &&
        markdown.includes(LEDGER_CONFIG_END) &&
        markdown.includes(LEDGER_SNAPSHOT_START) &&
        markdown.includes(LEDGER_SNAPSHOT_END)
    )
}

export function parseRemoteRepository(remoteUrl: string): string | null {
    const normalized = remoteUrl.trim().replace(/\.git$/u, '')
    if (!normalized) {
        return null
    }

    const sshMatch = normalized.match(/^[^@]+@[^:]+:(.+)$/u)
    if (sshMatch?.[1]) {
        return sshMatch[1].replace(/^\/+|\/+$/gu, '')
    }

    const urlMatch = normalized.match(/^[a-z]+:\/\/[^/]+\/(.+)$/iu)
    if (urlMatch?.[1]) {
        return urlMatch[1].replace(/^\/+|\/+$/gu, '')
    }

    return null
}

export function parseLedgerConfig(markdown: string): UpstreamLedgerConfig {
    const parsed = JSON.parse(extractMarkedJson(markdown)) as unknown
    if (!isObject(parsed)) {
        throw new Error('upstream ledger config must be an object')
    }

    const upstream = parsed.upstream
    const forkPoint = parsed.forkPoint
    const audit = parsed.audit

    if (
        parsed.schemaVersion !== 1 ||
        typeof parsed.repo !== 'string' ||
        !isObject(upstream) ||
        typeof upstream.remote !== 'string' ||
        typeof upstream.branch !== 'string' ||
        typeof upstream.repository !== 'string' ||
        !isObject(forkPoint) ||
        !(forkPoint.commit === null || typeof forkPoint.commit === 'string') ||
        typeof forkPoint.label !== 'string' ||
        !['low', 'medium', 'high'].includes(String(forkPoint.confidence)) ||
        typeof forkPoint.notes !== 'string' ||
        !isObject(audit) ||
        !(audit.lastAuditedCommit === null || typeof audit.lastAuditedCommit === 'string') ||
        typeof audit.auditedRange !== 'string' ||
        !(audit.auditDate === null || typeof audit.auditDate === 'string') ||
        typeof audit.strategy !== 'string'
    ) {
        throw new Error('invalid upstream ledger config shape')
    }

    return {
        schemaVersion: 1,
        repo: parsed.repo,
        upstream: {
            remote: upstream.remote,
            branch: upstream.branch,
            repository: upstream.repository,
        },
        forkPoint: {
            commit: forkPoint.commit,
            label: forkPoint.label,
            confidence: forkPoint.confidence as UpstreamLedgerConfig['forkPoint']['confidence'],
            notes: forkPoint.notes,
        },
        audit: {
            lastAuditedCommit: audit.lastAuditedCommit,
            auditedRange: audit.auditedRange,
            auditDate: audit.auditDate,
            strategy: audit.strategy,
        },
    }
}

export function replaceLedgerSnapshot(markdown: string, snapshotMarkdown: string): string {
    return replaceMarkedBlock(markdown, LEDGER_SNAPSHOT_START, LEDGER_SNAPSHOT_END, snapshotMarkdown)
}

export function buildBootstrapLedger(config: UpstreamLedgerConfig): string {
    return `# Internal Upstream Ledger

> Internal only. Do not publish, quote, ship, or mention in external changelogs / README / release notes.

## Purpose

Keep a machine-readable upstream audit cursor plus a human decision ledger so fork maintenance stays recoverable, selective, and reviewable.

${LEDGER_CONFIG_START}
\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`
${LEDGER_CONFIG_END}

${LEDGER_SNAPSHOT_START}
## Generated Snapshot

- Run \`bun run harness:upstream\` to populate the current upstream status.
${LEDGER_SNAPSHOT_END}

## Review Decisions

| Commit | Status | Decision | Note |
| --- | --- | --- | --- |

## Adapted In This Pass

- None yet.

## Validation

- Record focused checks here after each upstream adaptation pass.

## Next Candidates

1. Fill after the first audit pass.

## Working Rules

- Audit upstream in commit order from the last audited commit forward.
- Record every decision here: \`already-adapted\`, \`adapted-now\`, \`skip\`, \`skip-for-now\`, \`superseded\`, or \`needs-deep-adapt\`.
- Prefer product-native adaptations over raw cherry-picks.
- Keep the config block accurate; keep the decision log explicit.
`
}

export function buildDefaultLedgerConfig(args: {
    repo: string
    upstreamRemote: string
    upstreamBranch: string
    upstreamRepository: string
}): UpstreamLedgerConfig {
    return {
        schemaVersion: 1,
        repo: args.repo,
        upstream: {
            remote: args.upstreamRemote,
            branch: args.upstreamBranch,
            repository: args.upstreamRepository,
        },
        forkPoint: {
            commit: null,
            label: 'fill me',
            confidence: 'low',
            notes: '首次建立账本后，补上 fork 基线 commit 与理由。',
        },
        audit: {
            lastAuditedCommit: null,
            auditedRange: '',
            auditDate: null,
            strategy: DEFAULT_STRATEGY,
        },
    }
}
