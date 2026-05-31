import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    createPairingTunnelCipher,
    createPairingTunnelKeyFrame,
    PairingCreateResponseSchema,
    type PairingTunnelPlainFrame,
    type PairingTunnelRelayFrame,
    PairingTunnelRelayFrameSchema,
    PairingVerifyCodeResponseSchema,
} from '../../shared/src/pairing'
import { buildPairingSmokeVerifyCodeRequest, DIRECT_WEBRTC_SMOKE_PUBLIC_KEY } from './pairingSmokeContracts'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = dirname(dirname(scriptDir))
const brokerUrl = process.env.PAIRING_BROKER_URL || process.env.VIBY_PAIRING_BROKER_URL || 'https://pair.viby.run'
const createToken = process.env.PAIRING_CREATE_TOKEN ?? ''
const pingCount = Number.parseInt(process.env.PING_COUNT || '12', 10)
const timeoutMs = Number.parseInt(process.env.PING_TIMEOUT_MS || '5000', 10)

type TunnelEndpoint = {
    close(): void
    sendFrame(frame: PairingTunnelPlainFrame): Promise<void>
    waitForFrame(predicate: (frame: PairingTunnelPlainFrame) => boolean): Promise<PairingTunnelPlainFrame>
}

function createEvidenceDir(): string {
    const artifactRoot = join(repoRoot, '.artifacts', 'harness')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const workDir = join(artifactRoot, `pairing-public-relay-${stamp}`)
    mkdirSync(workDir, { recursive: true })
    return workDir
}

async function requestJson(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await fetch(new URL(path, brokerUrl), options)
    const text = await response.text()
    const body = text ? (JSON.parse(text) as { error?: string }) : {}
    if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`)
    return body
}

function waitForOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('relay websocket open timeout')), timeoutMs)
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
                reject(new Error('relay websocket error'))
            },
            { once: true }
        )
    })
}

async function openSecureTunnel(url: string, label: string): Promise<TunnelEndpoint> {
    const socket = new WebSocket(url)
    const cipher = await createPairingTunnelCipher()
    const pending: PairingTunnelPlainFrame[] = []
    const listeners = new Set<(frame: PairingTunnelPlainFrame) => void>()
    let keySeq = 0
    let readyResolve: () => void = () => {}
    let readyReject: (error: Error) => void = () => {}
    const ready = new Promise<void>((resolve, reject) => {
        readyResolve = resolve
        readyReject = reject
    })

    socket.addEventListener('message', (event) => {
        void handleMessage(String(event.data)).catch((error: unknown) => {
            readyReject(error instanceof Error ? error : new Error(String(error)))
        })
    })
    socket.addEventListener(
        'close',
        () => readyReject(new Error(`${label} relay websocket closed before key exchange`)),
        { once: true }
    )

    await waitForOpen(socket)
    sendRelayFrame(
        createPairingTunnelKeyFrame({ id: `${label}-key-${Date.now()}`, publicKey: cipher.publicKey, seq: keySeq++ })
    )
    await withTimeout(ready, `${label} secure tunnel key exchange timeout`)

    return {
        close: () => socket.close(),
        sendFrame: async (frame) => sendRelayFrame(await cipher.seal(frame)),
        waitForFrame: (predicate) => waitForPlainFrame(pending, listeners, predicate),
    }

    async function handleMessage(data: string): Promise<void> {
        const parsed = PairingTunnelRelayFrameSchema.safeParse(JSON.parse(data))
        if (!parsed.success) return
        const frame = parsed.data
        if (frame.kind === 'key') {
            await cipher.receivePeerKey(frame.publicKey)
            sendRelayFrame(
                createPairingTunnelKeyFrame({
                    id: `${label}-key-${Date.now()}`,
                    publicKey: cipher.publicKey,
                    seq: keySeq++,
                })
            )
            readyResolve()
            return
        }
        if (!cipher.isReady()) return
        const plainFrame = await cipher.open(frame)
        pending.push(plainFrame)
        for (const listener of listeners) listener(plainFrame)
    }

    function sendRelayFrame(frame: PairingTunnelRelayFrame): void {
        socket.send(JSON.stringify(frame))
    }
}

function waitForPlainFrame(
    pending: PairingTunnelPlainFrame[],
    listeners: Set<(frame: PairingTunnelPlainFrame) => void>,
    predicate: (frame: PairingTunnelPlainFrame) => boolean
): Promise<PairingTunnelPlainFrame> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('relay plaintext frame timeout')), timeoutMs)
        for (const frame of pending) {
            if (!predicate(frame)) continue
            clearTimeout(timer)
            resolve(frame)
            return
        }
        const onFrame = (frame: PairingTunnelPlainFrame) => {
            if (!predicate(frame)) return
            clearTimeout(timer)
            listeners.delete(onFrame)
            resolve(frame)
        }
        listeners.add(onFrame)
    })
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs)
            }),
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

function percentile(values: number[], ratio: number): number | null {
    if (values.length === 0) return null
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
}

async function main(): Promise<void> {
    if (!createToken) throw new Error('PAIRING_CREATE_TOKEN is required for public relay smoke')
    const workDir = createEvidenceDir()
    const created = PairingCreateResponseSchema.parse(
        await requestJson('/pairings', {
            method: 'POST',
            headers: { authorization: `Bearer ${createToken}`, 'content-type': 'application/json' },
            body: JSON.stringify({ label: 'Public Relay Smoke Host' }),
        })
    )
    if (!created.pairing.shortCode) throw new Error('create response missing shortCode')
    const verified = PairingVerifyCodeResponseSchema.parse(
        await requestJson(`/pairings/${created.pairing.id}/verify-code`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(
                buildPairingSmokeVerifyCodeRequest({
                    code: created.pairing.shortCode,
                    label: 'Public Relay Smoke Guest',
                    publicKey: DIRECT_WEBRTC_SMOKE_PUBLIC_KEY,
                })
            ),
        })
    )

    const [host, guest] = await Promise.all([
        openSecureTunnel(created.tunnelUrl, 'host'),
        openSecureTunnel(verified.tunnelUrl, 'guest'),
    ])
    const samples: number[] = []
    try {
        for (let seq = 0; seq < pingCount; seq += 1) {
            const sentAt = Date.now()
            await guest.sendFrame({
                kind: 'message',
                id: `ping-${seq}`,
                seq,
                payload: { kind: 'public-relay-ping', sentAt },
            })
            const ping = await host.waitForFrame((frame) => frame.kind === 'message' && frame.seq === seq)
            if (ping.kind !== 'message') throw new Error('unexpected non-message ping frame')
            await host.sendFrame({
                kind: 'message',
                id: `ack-${seq}`,
                seq,
                payload: { kind: 'public-relay-ack', sentAt },
            })
            await guest.waitForFrame((frame) => frame.kind === 'message' && frame.seq === seq)
            samples.push(Date.now() - sentAt)
        }
    } finally {
        host.close()
        guest.close()
    }

    const summary = {
        ok: true,
        transportMode: 'relay-wss',
        brokerUrl,
        pingCount,
        ackCount: samples.length,
        p50RttMs: percentile(samples, 0.5),
        p95RttMs: percentile(samples, 0.95),
        maxRttMs: Math.max(...samples),
        evidenceDir: workDir,
    }
    writeFileSync(join(workDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
    console.log(JSON.stringify(summary))
}

if (import.meta.main) await main()
