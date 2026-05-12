#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REMOVED_PATTERNS = [
    {
        root: 'web/src',
        pattern:
            /remotePairing\.error\.(closed|closedScanAgain|expired|fallback|hostClosed|hostUnavailable|p2pBlocked|p2pTimedOut|peerNotConnected|peerTimeout|socket)\b/,
    },
    {
        root: 'web/src',
        pattern: /remotePairing\.(connecting|reconnectNotice)\.phase\.connecting/,
    },
    { root: 'desktop/src/types.ts', pattern: /'idle'|'paused'/ },
    { root: 'web/src/lib/remoteConnectingPhase.ts', pattern: /'connecting'/ },
]
const REQUIRED_KEYS = [
    'remotePairing.reconnectNotice.attemptCount',
    'remotePairing.reconnectNotice.stopAction',
    'remotePairing.error.userCancelled',
    'remotePairing.error.pairingUnavailable',
]
const LOCALE_FILES = ['web/src/lib/locales/zh-CN-primary.ts', 'web/src/lib/locales/en-primary.ts']
const SOURCE_EXT = /\.(ts|tsx)$/

function walk(path) {
    if (!statSync(path, { throwIfNoEntry: false })) return []
    if (statSync(path).isFile()) return [path]
    return readdirSync(path).flatMap((entry) => walk(join(path, entry)))
}

function scanRemoved() {
    const failures = []
    for (const rule of REMOVED_PATTERNS) {
        for (const file of walk(rule.root).filter((path) => SOURCE_EXT.test(path))) {
            const content = readFileSync(file, 'utf8')
            if (rule.pattern.test(content)) failures.push(`${file}: ${rule.pattern}`)
        }
    }
    return failures
}

function scanRequired() {
    const failures = []
    for (const file of LOCALE_FILES) {
        const content = readFileSync(file, 'utf8')
        for (const key of REQUIRED_KEYS) {
            if (!content.includes(key)) failures.push(`${file}: missing ${key}`)
        }
    }
    return failures
}

const failures = [...scanRemoved(), ...scanRequired()]
if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exit(1)
}
console.log('pairing front-end coverage ok')
