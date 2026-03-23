import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { networkInterfaces, homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

export const DEFAULT_REMOTE_HUB_PORT = 37173
export const DEFAULT_REMOTE_WEB_PORT = 5173
const DEV_REMOTE_LOCK_FILENAME = '.viby-dev-remote.lock.json'

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost']

export type RemoteDevContext = {
    hubPort: number
    vitePort: number
    hosts: string[]
    hubProxyUrl: string
    webOrigins: string[]
    remoteDevUrls: string[]
    directHubUrls: string[]
}

export type DevRemoteLock = {
    pid: number
    repoRoot: string
    hubPort: number
    vitePort: number
    createdAt: string
}

export function parseRemotePort(raw: string | undefined, fallback: number): number {
    if (!raw) {
        return fallback
    }

    const value = Number.parseInt(raw, 10)
    if (!Number.isFinite(value) || value <= 0) {
        return fallback
    }

    return value
}

export function parseRemoteFlag(raw: string | undefined): boolean {
    if (!raw) {
        return false
    }

    const normalized = raw.trim().toLowerCase()
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function resolveVibyHome(raw: string | undefined, repoRoot: string): string {
    if (!raw) {
        return resolve(homedir(), '.viby')
    }

    const expanded = raw.replace(/^~/, homedir())
    if (isAbsolute(expanded)) {
        return expanded
    }

    return resolve(repoRoot, expanded)
}

export function getDevRemoteLockPath(repoRoot: string): string {
    return join(repoRoot, DEV_REMOTE_LOCK_FILENAME)
}

function isValidDevRemoteLock(value: unknown): value is DevRemoteLock {
    if (!value || typeof value !== 'object') {
        return false
    }

    const candidate = value as Partial<DevRemoteLock>
    return Number.isInteger(candidate.pid)
        && typeof candidate.repoRoot === 'string'
        && Number.isInteger(candidate.hubPort)
        && Number.isInteger(candidate.vitePort)
        && typeof candidate.createdAt === 'string'
}

function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
        return false
    }

    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

export function readActiveDevRemoteLock(repoRoot: string): DevRemoteLock | null {
    const lockPath = getDevRemoteLockPath(repoRoot)
    if (!existsSync(lockPath)) {
        return null
    }

    try {
        const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as unknown
        if (!isValidDevRemoteLock(parsed) || !isProcessAlive(parsed.pid)) {
            unlinkSync(lockPath)
            return null
        }
        return parsed
    } catch {
        unlinkSync(lockPath)
        return null
    }
}

export function writeDevRemoteLock(repoRoot: string, lock: DevRemoteLock): void {
    writeFileSync(getDevRemoteLockPath(repoRoot), JSON.stringify(lock, null, 2))
}

export function removeDevRemoteLock(repoRoot: string, pid: number): void {
    const lockPath = getDevRemoteLockPath(repoRoot)
    if (!existsSync(lockPath)) {
        return
    }

    try {
        const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as unknown
        if (isValidDevRemoteLock(parsed) && parsed.pid !== pid) {
            return
        }
    } catch {
        // Ignore malformed stale locks and remove them below.
    }

    unlinkSync(lockPath)
}

function pushUniqueHost(target: string[], seen: Set<string>, host: string): void {
    const normalized = host.trim()
    if (!normalized || seen.has(normalized)) {
        return
    }

    seen.add(normalized)
    target.push(normalized)
}

function buildHttpOrigin(host: string, port: number): string {
    return `http://${host}:${port}`
}

export function getAccessibleHosts(): string[] {
    const hosts: string[] = []
    const seen = new Set<string>()

    for (const loopbackHost of LOOPBACK_HOSTS) {
        pushUniqueHost(hosts, seen, loopbackHost)
    }

    const interfaces = networkInterfaces()
    for (const entries of Object.values(interfaces)) {
        if (!entries) {
            continue
        }

        for (const entry of entries) {
            if (entry.internal || entry.family !== 'IPv4') {
                continue
            }
            pushUniqueHost(hosts, seen, entry.address)
        }
    }

    return hosts
}

export function buildRemoteDevContext(hosts: string[], options?: {
    hubPort?: number
    vitePort?: number
}): RemoteDevContext {
    const hubPort = options?.hubPort ?? DEFAULT_REMOTE_HUB_PORT
    const vitePort = options?.vitePort ?? DEFAULT_REMOTE_WEB_PORT
    const normalizedHosts: string[] = []
    const seen = new Set<string>()

    for (const host of hosts) {
        pushUniqueHost(normalizedHosts, seen, host)
    }

    const webOrigins = normalizedHosts.map((host) => buildHttpOrigin(host, vitePort))
    const directHubUrls = normalizedHosts.map((host) => buildHttpOrigin(host, hubPort))
    const remoteDevUrls = normalizedHosts.map((host) => buildHttpOrigin(host, vitePort))

    return {
        hubPort,
        vitePort,
        hosts: normalizedHosts,
        hubProxyUrl: `http://127.0.0.1:${hubPort}`,
        webOrigins,
        remoteDevUrls,
        directHubUrls,
    }
}
