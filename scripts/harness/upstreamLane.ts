import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    buildBootstrapLedger,
    buildDefaultLedgerConfig,
    hasLedgerMarkers,
    parseLedgerConfig,
    parseRemoteRepository,
    replaceLedgerSnapshot,
    type UpstreamLedgerConfig,
} from './upstreamSupport'

type CommitEntry = {
    sha: string
    shortSha: string
    date: string
    subject: string
}

type RefEntry = CommitEntry & {
    ref: string
    exists: boolean
    nearestTag: string | null
}

type UpstreamSnapshot = {
    version: 1
    generatedAt: string
    fetchPerformed: boolean
    status: 'up-to-date' | 'updates-available' | 'audit-cursor-invalid' | 'needs-audit-cursor'
    warnings: string[]
    ledgerPath: string
    repo: string
    upstream: {
        remote: string
        branch: string
        repository: string
        ref: string
    }
    localHead: RefEntry
    upstreamHead: RefEntry
    mergeBase: RefEntry | null
    divergence: {
        ahead: number | null
        behind: number | null
    }
    forkPoint: {
        commit: string | null
        label: string
        confidence: string
        notes: string
        exists: boolean
        onLocalHistory: boolean
        onUpstreamHistory: boolean
        nearestTag: string | null
    }
    auditCursor: {
        commit: string | null
        exists: boolean
        auditedRange: string
        auditDate: string | null
        strategy: string
        onUpstreamHistory: boolean
        pendingRange: string | null
        pendingCommitCount: number | null
        pendingCommits: CommitEntry[]
    }
    localOnlyCommits: CommitEntry[]
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const ledgerPath = join(repoRoot, 'docs/internal/update.md')
const artifactDir = join(repoRoot, '.artifacts/harness/upstream')
const pendingCommitLimit = 16
const localOnlyCommitLimit = 10

function runGit(args: string[], allowFailure = false): string | null {
    try {
        return execFileSync('git', args, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim()
    } catch (error) {
        if (allowFailure) {
            return null
        }
        throw error
    }
}

function resolveCommit(ref: string | null): string | null {
    if (!ref) {
        return null
    }
    return runGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], true)
}

function readCommit(ref: string): RefEntry {
    const sha = resolveCommit(ref)
    if (!sha) {
        return {
            ref,
            exists: false,
            sha: '',
            shortSha: '',
            date: '',
            subject: '',
            nearestTag: null,
        }
    }

    const raw = runGit(['show', '-s', '--format=%H%x00%h%x00%cI%x00%s', sha]) ?? ''
    const [fullSha = '', shortSha = '', date = '', subject = ''] = raw.split('\u0000')
    return {
        ref,
        exists: true,
        sha: fullSha,
        shortSha,
        date,
        subject,
        nearestTag: runGit(['describe', '--tags', '--abbrev=0', sha], true),
    }
}

function isAncestor(ancestorRef: string | null, targetRef: string): boolean {
    if (!ancestorRef) {
        return false
    }
    const ancestorSha = resolveCommit(ancestorRef)
    if (!ancestorSha) {
        return false
    }
    return runGit(['merge-base', '--is-ancestor', ancestorSha, targetRef], true) !== null
}

function listCommits(range: string, maxCount: number, reverse = false): CommitEntry[] {
    const args = ['log', '--format=%H%x00%h%x00%cI%x00%s', `--max-count=${maxCount}`]
    if (reverse) {
        args.push('--reverse')
    }
    args.push(range)
    const output = runGit(args, true)
    if (!output) {
        return []
    }
    return output
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [sha = '', shortSha = '', date = '', subject = ''] = line.split('\u0000')
            return { sha, shortSha, date, subject }
        })
}

function readDivergence(upstreamRef: string): { ahead: number | null; behind: number | null } {
    const counts = runGit(['rev-list', '--left-right', '--count', `HEAD...${upstreamRef}`], true)
    if (!counts) {
        return { ahead: null, behind: null }
    }
    const [aheadRaw = '', behindRaw = ''] = counts.split(/\s+/)
    const ahead = Number.parseInt(aheadRaw, 10)
    const behind = Number.parseInt(behindRaw, 10)
    return {
        ahead: Number.isFinite(ahead) ? ahead : null,
        behind: Number.isFinite(behind) ? behind : null,
    }
}

function countRange(range: string | null): number | null {
    if (!range) {
        return null
    }
    const value = runGit(['rev-list', '--count', range], true)
    if (!value) {
        return null
    }
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
}

function deriveDefaultConfig(): UpstreamLedgerConfig {
    const upstreamRemote = runGit(['remote', 'get-url', 'upstream'], true)
    if (!upstreamRemote) {
        throw new Error('missing upstream remote; cannot bootstrap docs/internal/update.md')
    }

    const symbolicHead = runGit(['symbolic-ref', 'refs/remotes/upstream/HEAD'], true)
    const upstreamBranch = symbolicHead?.split('/').at(-1) ?? 'main'
    return buildDefaultLedgerConfig({
        repo: basename(repoRoot),
        upstreamRemote: 'upstream',
        upstreamBranch,
        upstreamRepository: parseRemoteRepository(upstreamRemote) ?? upstreamRemote,
    })
}

function ensureLedger(): string {
    if (!existsSync(ledgerPath)) {
        const bootstrap = buildBootstrapLedger(deriveDefaultConfig())
        writeFileSync(ledgerPath, bootstrap)
        return bootstrap
    }

    const ledger = readFileSync(ledgerPath, 'utf8')
    if (!hasLedgerMarkers(ledger)) {
        throw new Error(
            'docs/internal/update.md is in legacy format; migrate it to upstream-lane markers before running the lane'
        )
    }
    return ledger
}

function determineStatus(snapshot: Omit<UpstreamSnapshot, 'status'>): UpstreamSnapshot['status'] {
    if (!snapshot.auditCursor.commit || !snapshot.auditCursor.exists) {
        return 'needs-audit-cursor'
    }
    if (!snapshot.auditCursor.onUpstreamHistory) {
        return 'audit-cursor-invalid'
    }
    if ((snapshot.auditCursor.pendingCommitCount ?? 0) > 0) {
        return 'updates-available'
    }
    return 'up-to-date'
}

function collectSnapshot(config: UpstreamLedgerConfig, fetchPerformed: boolean): UpstreamSnapshot {
    const upstreamRef = `${config.upstream.remote}/${config.upstream.branch}`
    const localHead = readCommit('HEAD')
    const upstreamHead = readCommit(upstreamRef)
    if (!upstreamHead.exists) {
        throw new Error(`missing upstream ref: ${upstreamRef}. Run git fetch ${config.upstream.remote} first.`)
    }

    const mergeBaseSha = runGit(['merge-base', 'HEAD', upstreamRef], true)
    const warnings: string[] = []
    if (!mergeBaseSha) {
        warnings.push('HEAD 与 upstream 没有可用 merge-base；fork 追踪将以 ledger config 与审计游标为准。')
    }

    const forkPointCommit = config.forkPoint.commit
    const forkPointExists = Boolean(resolveCommit(forkPointCommit))
    const forkPointOnLocal = isAncestor(forkPointCommit, 'HEAD')
    const forkPointOnUpstream = isAncestor(forkPointCommit, upstreamRef)
    if (forkPointCommit && !forkPointOnUpstream) {
        warnings.push('配置中的 forkPoint 不在当前 upstream 历史上；请确认最初 fork 基线或保留为仅本地参考。')
    }

    const auditCommit = config.audit.lastAuditedCommit
    const auditExists = Boolean(resolveCommit(auditCommit))
    const auditOnUpstream = isAncestor(auditCommit, upstreamRef)
    if (auditCommit && auditExists && !auditOnUpstream) {
        warnings.push('lastAuditedCommit 不在当前 upstream 主线；需要人工校正审计游标后再继续。')
    }

    const pendingRange = auditCommit && auditOnUpstream ? `${auditCommit}..${upstreamRef}` : null
    const pendingCommitCount = countRange(pendingRange)
    const snapshotBase: Omit<UpstreamSnapshot, 'status'> = {
        version: 1,
        generatedAt: new Date().toISOString(),
        fetchPerformed,
        warnings,
        ledgerPath: 'docs/internal/update.md',
        repo: config.repo,
        upstream: {
            remote: config.upstream.remote,
            branch: config.upstream.branch,
            repository: config.upstream.repository,
            ref: upstreamRef,
        },
        localHead,
        upstreamHead,
        mergeBase: mergeBaseSha ? readCommit(mergeBaseSha) : null,
        divergence: readDivergence(upstreamRef),
        forkPoint: {
            commit: forkPointCommit,
            label: config.forkPoint.label,
            confidence: config.forkPoint.confidence,
            notes: config.forkPoint.notes,
            exists: forkPointExists,
            onLocalHistory: forkPointOnLocal,
            onUpstreamHistory: forkPointOnUpstream,
            nearestTag: forkPointCommit ? runGit(['describe', '--tags', '--abbrev=0', forkPointCommit], true) : null,
        },
        auditCursor: {
            commit: auditCommit,
            exists: auditExists,
            auditedRange: config.audit.auditedRange,
            auditDate: config.audit.auditDate,
            strategy: config.audit.strategy,
            onUpstreamHistory: auditOnUpstream,
            pendingRange,
            pendingCommitCount,
            pendingCommits: pendingRange ? listCommits(pendingRange, pendingCommitLimit, true) : [],
        },
        localOnlyCommits: listCommits(`${upstreamRef}..HEAD`, localOnlyCommitLimit),
    }

    return {
        ...snapshotBase,
        status: determineStatus(snapshotBase),
    }
}

export function renderUpstreamSnapshot(snapshot: UpstreamSnapshot): string {
    const lines: string[] = []
    lines.push('## Generated Snapshot')
    lines.push('')
    lines.push(`- Generated at: \`${snapshot.generatedAt}\``)
    lines.push(`- Status: \`${snapshot.status}\``)
    lines.push(`- Fetch performed: ${snapshot.fetchPerformed ? 'yes' : 'no'}`)
    lines.push(`- Local head: \`${snapshot.localHead.shortSha}\` ${snapshot.localHead.subject}`)
    lines.push(`- Upstream head: \`${snapshot.upstreamHead.shortSha}\` ${snapshot.upstreamHead.subject}`)
    lines.push(
        `- Divergence: ahead \`${snapshot.divergence.ahead ?? 'unknown'}\` / behind \`${snapshot.divergence.behind ?? 'unknown'}\``
    )
    lines.push(
        `- Nearest tags: local \`${snapshot.localHead.nearestTag ?? 'none'}\` / upstream \`${snapshot.upstreamHead.nearestTag ?? 'none'}\``
    )
    lines.push(
        `- Merge base: ${snapshot.mergeBase ? `\`${snapshot.mergeBase.shortSha}\` ${snapshot.mergeBase.subject}` : 'none'}`
    )
    lines.push(
        `- Fork point: ${snapshot.forkPoint.commit ? `\`${snapshot.forkPoint.commit.slice(0, 8)}\` ${snapshot.forkPoint.label}` : 'unset'}`
    )
    lines.push(
        `- Fork point reachability: local \`${snapshot.forkPoint.onLocalHistory ? 'yes' : 'no'}\` / upstream \`${snapshot.forkPoint.onUpstreamHistory ? 'yes' : 'no'}\``
    )
    lines.push(
        `- Audit cursor: ${snapshot.auditCursor.commit ? `\`${snapshot.auditCursor.commit.slice(0, 8)}\`` : 'unset'}`
    )
    lines.push(`- Last audited range: \`${snapshot.auditCursor.auditedRange || 'unset'}\``)
    lines.push(`- Pending upstream commits: \`${snapshot.auditCursor.pendingCommitCount ?? 'unknown'}\``)
    if (snapshot.auditCursor.pendingRange) {
        lines.push(`- Next review range: \`${snapshot.auditCursor.pendingRange}\``)
    }
    if (snapshot.warnings.length > 0) {
        lines.push('')
        lines.push('### Warnings')
        lines.push('')
        for (const warning of snapshot.warnings) {
            lines.push(`- ${warning}`)
        }
    }
    lines.push('')
    lines.push('### Pending Upstream Commits')
    lines.push('')
    if (snapshot.auditCursor.pendingCommits.length === 0) {
        lines.push('- none')
    } else {
        for (const commit of snapshot.auditCursor.pendingCommits) {
            lines.push(`- \`${commit.shortSha}\` ${commit.subject} (${commit.date.slice(0, 10)})`)
        }
    }
    lines.push('')
    lines.push('### Recent Local-only Commits')
    lines.push('')
    if (snapshot.localOnlyCommits.length === 0) {
        lines.push('- none')
    } else {
        for (const commit of snapshot.localOnlyCommits) {
            lines.push(`- \`${commit.shortSha}\` ${commit.subject} (${commit.date.slice(0, 10)})`)
        }
    }
    return lines.join('\n')
}

function main(): void {
    const shouldFetch = process.argv.includes('--fetch')
    const ledger = ensureLedger()
    const config = parseLedgerConfig(ledger)
    if (shouldFetch) {
        runGit(['fetch', config.upstream.remote])
    }
    const snapshot = collectSnapshot(config, shouldFetch)
    const snapshotMarkdown = renderUpstreamSnapshot(snapshot)
    const nextLedger = replaceLedgerSnapshot(ledger, snapshotMarkdown)

    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(ledgerPath, nextLedger)
    writeFileSync(
        join(artifactDir, 'latest.json'),
        JSON.stringify(
            {
                config,
                snapshot,
            },
            null,
            2
        )
    )
    writeFileSync(join(artifactDir, 'latest.md'), snapshotMarkdown)

    console.log(`[harness] upstream lane: ${snapshot.status}`)
    console.log(`[harness] ledger: ${snapshot.ledgerPath}`)
    console.log(`[harness] pending upstream commits: ${snapshot.auditCursor.pendingCommitCount ?? 'unknown'}`)
    if (snapshot.warnings.length > 0) {
        for (const warning of snapshot.warnings) {
            console.warn(`[harness] warning: ${warning}`)
        }
    }
}

main()
