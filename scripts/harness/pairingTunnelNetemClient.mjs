import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'

const role = process.argv[2]
const sharedDir = process.env.SHARED_DIR || '/shared'
const brokerUrl = process.env.BROKER_URL
const createToken = process.env.PAIRING_CREATE_TOKEN
const pingCount = Number.parseInt(process.env.PING_COUNT || '24', 10)
const timeoutMs = Number.parseInt(process.env.PING_TIMEOUT_MS || '5000', 10)
const handoverBlackholeMs = Number.parseInt(process.env.NETEM_BLACKHOLE_MS || '1500', 10)
const reopenGuestTunnel = process.env.REOPEN_GUEST_TUNNEL !== '0'
const runNetemHandover = process.env.NETEM_HANDOVER !== '0'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const keyInfo = encoder.encode('viby-pairing-tunnel-v1')

if (role !== 'host' && role !== 'guest') throw new Error('role must be host or guest')
if (!brokerUrl) throw new Error('BROKER_URL is required')

const sessionPath = `${sharedDir}/session.json`
const hostReadyPath = `${sharedDir}/host-ready`
const resultPath = `${sharedDir}/result.json`
const donePath = `${sharedDir}/done`

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function ipAddress() {
    const result = spawnSync('hostname', ['-i'], { encoding: 'utf8' })
    return result.stdout.trim().split(/\s+/)[0] || hostname()
}

function writeJson(path, value) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'))
}

async function waitForFile(path, label) {
    const deadline = Date.now() + 30_000
    while (!existsSync(path)) {
        if (Date.now() > deadline) throw new Error(`${label} timeout`)
        await sleep(100)
    }
    return readJson(path)
}

async function requestJson(path, options = {}) {
    const response = await fetch(new URL(path, brokerUrl), options)
    const text = await response.text()
    const body = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`)
    return body
}

function waitForOpen(socket) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('websocket open timeout')), timeoutMs)
        socket.addEventListener(
            'open',
            () => {
                clearTimeout(timer)
                resolve()
            },
            { once: true }
        )
        socket.addEventListener(
            'error',
            () => {
                clearTimeout(timer)
                reject(new Error('websocket error'))
            },
            { once: true }
        )
    })
}

async function createCipher() {
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey)))
    let sealedKey = null
    return {
        publicKey,
        ready: () => Boolean(sealedKey),
        receivePeerKey: async (peerPublicKey) => {
            const peerKey = await crypto.subtle.importKey(
                'spki',
                fromBase64Url(peerPublicKey),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            )
            const sharedBits = await crypto.subtle.deriveBits(
                { name: 'ECDH', public: peerKey },
                keyPair.privateKey,
                256
            )
            const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
            sealedKey = await crypto.subtle.deriveKey(
                { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: keyInfo },
                hkdfKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            )
        },
        seal: async (frame) => {
            if (!sealedKey) throw new Error('cipher is not ready')
            const nonce = crypto.getRandomValues(new Uint8Array(12))
            const ciphertext = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                sealedKey,
                encoder.encode(JSON.stringify(frame))
            )
            return {
                kind: 'sealed',
                id: frame.id,
                seq: frame.seq,
                nonce: toBase64Url(nonce),
                ciphertext: toBase64Url(new Uint8Array(ciphertext)),
            }
        },
        open: async (frame) => {
            if (!sealedKey) throw new Error('cipher is not ready')
            const plaintext = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: fromBase64Url(frame.nonce) },
                sealedKey,
                fromBase64Url(frame.ciphertext)
            )
            return JSON.parse(decoder.decode(plaintext))
        },
    }
}

function toBase64Url(bytes) {
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value) {
    const padded = value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
}

async function openSecureTunnel(url) {
    const socket = new WebSocket(url)
    const cipher = await createCipher()
    const listeners = new Set()
    const pending = []
    let peerPublicKey = null
    let readyResolve
    let readyReject
    const ready = new Promise((resolve, reject) => {
        readyResolve = resolve
        readyReject = reject
    })
    socket.addEventListener('message', (event) => {
        void handleMessage(String(event.data)).catch((error) => readyReject(error))
    })
    socket.addEventListener('close', () => readyReject(new Error('secure tunnel closed before key exchange')), {
        once: true,
    })
    await waitForOpen(socket)
    let keySeq = 0
    sendLocalKey()
    await ready
    return {
        close: () => socket.close(),
        onFrame: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        sendFrame: async (frame) => sendFrame(socket, await cipher.seal(frame)),
        waitForFrame: (predicate) => waitForPlainFrame(pending, listeners, predicate),
    }

    async function handleMessage(data) {
        const frame = JSON.parse(data)
        if (frame.kind === 'key') {
            const shouldReply = peerPublicKey !== frame.publicKey
            peerPublicKey = frame.publicKey
            await cipher.receivePeerKey(frame.publicKey)
            if (shouldReply) sendLocalKey()
            readyResolve()
            return
        }
        if (frame.kind !== 'sealed' || !cipher.ready()) return
        const plainFrame = await cipher.open(frame)
        pending.push(plainFrame)
        for (const listener of listeners) listener(plainFrame)
    }

    function sendLocalKey() {
        sendFrame(socket, { kind: 'key', id: `key-${Date.now()}`, seq: keySeq++, publicKey: cipher.publicKey })
    }
}

function waitForPlainFrame(pending, listeners, predicate) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('websocket message timeout')), timeoutMs)
        for (const frame of pending) {
            if (!predicate(frame)) continue
            clearTimeout(timer)
            resolve(frame)
            return
        }
        const cleanup = () => {
            clearTimeout(timer)
            listeners.delete(onFrame)
        }
        const onFrame = (frame) => {
            if (!predicate(frame)) return
            cleanup()
            resolve(frame)
        }
        listeners.add(onFrame)
    })
}

function sendFrame(socket, frame) {
    socket.send(JSON.stringify(frame))
}

function percentile(values, ratio) {
    if (values.length === 0) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

function replaceNetemProfile(args, label, timeline) {
    const result = spawnSync('tc', ['qdisc', 'replace', 'dev', 'eth0', 'root', 'netem', ...args], {
        encoding: 'utf8',
    })
    if (result.status !== 0) throw new Error(result.stderr || 'failed to replace netem profile')
    timeline.push({ atMs: Date.now(), label })
}

async function runHandoverProfile(timeline) {
    replaceNetemProfile(['loss', '100%'], 'blackhole', timeline)
    await sleep(handoverBlackholeMs)
    replaceNetemProfile(['delay', '180ms', '60ms', 'loss', '3%'], 'degraded-cellular', timeline)
}

async function runHost() {
    if (!createToken) throw new Error('PAIRING_CREATE_TOKEN is required for host')
    const created = await requestJson('/pairings', {
        method: 'POST',
        headers: { authorization: `Bearer ${createToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ label: 'Docker Netem Host' }),
    })
    const ticket = new URL(created.pairingUrl).hash.slice(1).split('ticket=')[1]
    if (!ticket || !created.tunnelUrl) throw new Error('create response missing ticket or tunnelUrl')
    writeJson(sessionPath, {
        pairingId: created.pairing.id,
        ticket,
        hostIp: ipAddress(),
    })

    const tunnel = await openSecureTunnel(created.tunnelUrl)
    writeJson(hostReadyPath, { ready: true })
    tunnel.onFrame((frame) => {
        if (frame.kind !== 'message' || frame.payload?.kind !== 'netem-ping') return
        void tunnel.sendFrame({
            kind: 'message',
            id: `ack-${frame.seq}`,
            seq: frame.seq,
            payload: { kind: 'netem-ack', seq: frame.seq, sentAt: frame.payload.sentAt },
        })
    })

    const deadline = Date.now() + 60_000
    while (!existsSync(donePath)) {
        if (Date.now() > deadline) throw new Error('guest result timeout')
        await sleep(100)
    }
    tunnel.close()
}

async function runGuest() {
    const session = await waitForFile(sessionPath, 'session')
    const claimed = await requestJson(`/pairings/${session.pairingId}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ticket: session.ticket, label: 'Docker Netem Guest' }),
    })
    if (!claimed.tunnelUrl) throw new Error('claim response missing tunnelUrl')
    let tunnel = await openSecureTunnel(claimed.tunnelUrl)
    await waitForFile(hostReadyPath, 'host ready')
    const samples = []
    const timeline = []
    const startedAt = Date.now()
    for (let seq = 0; seq < pingCount; seq += 1) {
        if (reopenGuestTunnel && seq === Math.floor(pingCount / 3)) {
            tunnel.close()
            await sleep(150)
            tunnel = await openSecureTunnel(claimed.tunnelUrl)
            timeline.push({ atMs: Date.now(), label: 'guest-tunnel-replaced' })
        }
        if (runNetemHandover && seq === Math.floor(pingCount / 2)) await runHandoverProfile(timeline)
        const sentAt = Date.now()
        await tunnel.sendFrame({
            kind: 'message',
            id: `ping-${seq}`,
            seq,
            payload: { kind: 'netem-ping', seq, sentAt },
        })
        await tunnel.waitForFrame(
            (frame) => frame.kind === 'message' && frame.payload?.kind === 'netem-ack' && frame.seq === seq
        )
        samples.push(Date.now() - sentAt)
    }
    const elapsedMs = Date.now() - startedAt
    tunnel.close()
    const p50 = percentile(samples, 0.5)
    const p95 = percentile(samples, 0.95)
    const summary = {
        ok: true,
        pingCount,
        ackCount: samples.length,
        elapsedMs,
        p50RttMs: p50,
        p95RttMs: p95,
        maxRttMs: Math.max(...samples),
        handoverBlackholeMs,
        netemTimeline: timeline.map((event) => ({ ...event, atMs: event.atMs - startedAt })),
        hostIp: session.hostIp,
        guestIp: ipAddress(),
    }
    writeJson(resultPath, summary)
    writeFileSync(donePath, 'done\n')
    console.log(JSON.stringify(summary))
}

await (role === 'host' ? runHost() : runGuest())
