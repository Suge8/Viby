#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const EXACT_FILES = [
    'shared/src/pairing/pairingSignal.ts',
    'shared/src/pairing/perfectNegotiation.ts',
    'shared/src/pairing/pairingTransport.ts',
    'pairing/src/ws.ts',
    'pairing/src/wsSupport.ts',
    'pairing/src/wsDisconnectGrace.ts',
    'pairing/src/wsTypes.ts',
    'pairing/src/wsConnectionIndex.ts',
    'web/src/remote/RemotePeerSession.ts',
    'web/src/remote/RemotePairingController.tsx',
    'web/src/remote/RemotePairingPersistence.ts',
    'web/src/remote/RemotePairingStatusScreen.tsx',
    'web/src/remote/RemotePairingHydrateSkeleton.tsx',
    'web/src/remote/remotePairingPendingRequests.ts',
    'web/src/remote/remotePairingChannelMessages.ts',
    'web/src/remote/remotePairingBinaryUpload.ts',
]
const PREFIX_FILES = [{ dir: 'desktop/src/lib', prefix: 'pairingBridge', suffixes: ['.ts', '.tsx'] }]
const EXCLUDE = /\.test\.(ts|tsx)$|__tests__\//

function parseMax() {
    const index = process.argv.indexOf('--max')
    const raw = index === -1 ? '1800' : process.argv[index + 1]
    const max = Number(raw)
    if (!Number.isInteger(max) || max <= 0) throw new Error(`Invalid --max: ${raw}`)
    return max
}

function walk(dir) {
    if (!existsSync(dir)) return []
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry)
        return statSync(path).isDirectory() ? walk(path) : [path]
    })
}

function collectFiles() {
    const files = new Set(EXACT_FILES.filter((file) => existsSync(file)))
    for (const pattern of PREFIX_FILES) {
        for (const file of walk(pattern.dir)) {
            const name = file.split('/').at(-1) ?? ''
            if (name.startsWith(pattern.prefix) && pattern.suffixes.some((suffix) => name.endsWith(suffix)))
                files.add(file)
        }
    }
    return [...files].filter((file) => !EXCLUDE.test(file)).sort()
}

function countLines(file) {
    const content = readFileSync(file, 'utf8')
    return content.length === 0 ? 0 : content.split('\n').length
}

const max = parseMax()
const rows = collectFiles().map((file) => ({ file, lines: countLines(file) }))
const total = rows.reduce((sum, row) => sum + row.lines, 0)
for (const row of rows) console.log(`${String(row.lines).padStart(4)} ${row.file}`)
console.log(`total ${total} / max ${max}`)
if (total > max) process.exit(1)
