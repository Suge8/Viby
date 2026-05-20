import { chromium, type Page } from 'playwright-core'
import { resolveChromeExecutablePath } from './browserSmokeRuntime'

export type DirectSmokeResult = {
    ackCount: number
    elapsedMs: number
    localCandidateType: string | null
    maxRttMs: number
    p50RttMs: number | null
    p95RttMs: number | null
    remoteCandidateType: string | null
    role: 'host' | 'guest'
}

type BrowserPeerOptions = {
    iceServers: RTCIceServer[]
    iceTransportPolicy?: RTCIceTransportPolicy
    pingCount: number
    role: 'host' | 'guest'
    wsUrl: string
}

const CHROME_ARGS = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--force-webrtc-ip-handling-policy=default_public_and_private_interfaces',
    '--no-first-run',
    '--no-sandbox',
]

export async function runBrowserPair(options: {
    brokerUrl: string
    createToken: string
    guestWsUrl: string
    hostWsUrl: string
    iceServers: RTCIceServer[]
    iceTransportPolicy?: RTCIceTransportPolicy
    pingCount: number
}): Promise<[DirectSmokeResult, DirectSmokeResult]> {
    const browser = await chromium.launch({
        executablePath: resolveChromeExecutablePath(),
        headless: true,
        args: CHROME_ARGS,
    })
    try {
        const [hostPage, guestPage] = await Promise.all([browser.newPage(), browser.newPage()])
        const readyUrl = new URL('/ready', options.brokerUrl).toString()
        await Promise.all([hostPage.goto(readyUrl), guestPage.goto(readyUrl)])
        await Promise.all([
            prepareBrowserPeer(hostPage, {
                iceServers: options.iceServers,
                iceTransportPolicy: options.iceTransportPolicy,
                pingCount: options.pingCount,
                role: 'host',
                wsUrl: options.hostWsUrl,
            }),
            prepareBrowserPeer(guestPage, {
                iceServers: options.iceServers,
                iceTransportPolicy: options.iceTransportPolicy,
                pingCount: options.pingCount,
                role: 'guest',
                wsUrl: options.guestWsUrl,
            }),
        ])
        await waitForPairedSignalSockets(options.brokerUrl, options.createToken)
        await hostPage.evaluate(() => (window as unknown as { __vibyStartHost: () => Promise<void> }).__vibyStartHost())
        await hostPage.evaluate(() =>
            (window as unknown as { __vibyReadyForPings: () => Promise<void> }).__vibyReadyForPings()
        )
        return await Promise.all([
            hostPage.evaluate(() =>
                (window as unknown as { __vibyFinishPeer: () => Promise<DirectSmokeResult> }).__vibyFinishPeer()
            ),
            guestPage.evaluate(() =>
                (window as unknown as { __vibyFinishPeer: () => Promise<DirectSmokeResult> }).__vibyFinishPeer()
            ),
        ])
    } finally {
        await browser.close()
    }
}

async function waitForPairedSignalSockets(brokerUrl: string, createToken: string): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 5_000) {
        const metrics = await requestJson<{ websocket: { pairedSessions: number } }>(brokerUrl, '/metrics', {
            headers: { authorization: `Bearer ${createToken}` },
        }).catch(() => null)
        if ((metrics?.websocket.pairedSessions ?? 0) > 0) return
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('pairing broker did not observe both signaling sockets')
}

async function requestJson<T>(baseUrl: string, path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(new URL(path, baseUrl), options)
    const text = await response.text()
    const body = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
    if (!response.ok) throw new Error(body.error || `${path} failed with ${response.status}`)
    return body
}

async function prepareBrowserPeer(page: Page, options: BrowserPeerOptions): Promise<void> {
    await page.evaluate(async ({ iceServers, iceTransportPolicy, pingCount, role, wsUrl }) => {
        const samples: number[] = []
        const startedAt = Date.now()
        const events: string[] = []
        const socket = new WebSocket(wsUrl)
        const peer = new RTCPeerConnection({ iceServers, iceTransportPolicy })
        const pendingCandidates: RTCIceCandidateInit[] = []
        let channel: RTCDataChannel | null = null
        let resolveChannel: (value: RTCDataChannel) => void = () => {}
        let hostEchoDone: Promise<void> | null = null
        const channelReady = new Promise<RTCDataChannel>((resolve) => {
            resolveChannel = resolve
        })

        function record(event: string): void {
            events.push(`${Date.now() - startedAt}ms ${event}`)
        }

        socket.addEventListener('open', () => record('signaling open'))
        socket.addEventListener('close', (event) => record(`signaling close ${event.code} ${event.reason}`))
        socket.addEventListener('error', () => record('signaling error'))
        peer.addEventListener('icegatheringstatechange', () => record(`ice-gather ${peer.iceGatheringState}`))
        peer.addEventListener('iceconnectionstatechange', () => record(`ice ${peer.iceConnectionState}`))
        peer.addEventListener('connectionstatechange', () => record(`peer ${peer.connectionState}`))

        function waitForOpen(target: WebSocket | RTCDataChannel, label: string): Promise<void> {
            const isWebSocket = target instanceof WebSocket
            if (isWebSocket ? target.readyState === WebSocket.OPEN : target.readyState === 'open') {
                return Promise.resolve()
            }
            return new Promise((resolve, reject) => {
                const cleanup = () => {
                    clearTimeout(timeout)
                    target.removeEventListener('open', onOpen)
                    target.removeEventListener('error', onError)
                    target.removeEventListener('close', onClose)
                }
                const fail = (message: string) => {
                    cleanup()
                    reject(new Error(`${message}; events=${events.join(' | ')}`))
                }
                const onOpen = () => {
                    cleanup()
                    resolve()
                }
                const onError = () => fail(`${label} error`)
                const onClose = (event: Event) => {
                    const close = event as CloseEvent
                    fail(`${label} closed code=${close.code ?? 'unknown'} reason=${close.reason ?? ''}`)
                }
                const timeout = setTimeout(
                    () => fail(`${label} open timeout readyState=${String(target.readyState)}`),
                    15_000
                )
                target.addEventListener('open', onOpen, { once: true })
                target.addEventListener('error', onError, { once: true })
                target.addEventListener('close', onClose, { once: true })
            })
        }

        function sendSignal(signal: unknown): void {
            record(`send ${(signal as { type?: string }).type ?? 'unknown'}`)
            socket.send(JSON.stringify(signal))
        }

        function describeCandidate(candidate: RTCIceCandidateInit | RTCIceCandidate): string {
            return candidate.candidate.match(/ typ ([a-z]+)/)?.[1] ?? 'unknown'
        }

        async function flushCandidates(): Promise<void> {
            while (peer.remoteDescription && pendingCandidates.length > 0) {
                await peer.addIceCandidate(pendingCandidates.shift() ?? undefined)
            }
        }

        async function selectedCandidate(): Promise<{
            localCandidateType: string | null
            remoteCandidateType: string | null
        }> {
            const stats = await peer.getStats()
            let selected: RTCStats | null = null
            stats.forEach((stat) => {
                if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
                    selected = stats.get(stat.selectedCandidatePairId) ?? selected
                }
                if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') selected = stat
            })
            const pair = selected as { localCandidateId?: string; remoteCandidateId?: string } | null
            const local = pair?.localCandidateId ? stats.get(pair.localCandidateId) : null
            const remote = pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null
            return {
                localCandidateType: typeof local?.candidateType === 'string' ? local.candidateType : null,
                remoteCandidateType: typeof remote?.candidateType === 'string' ? remote.candidateType : null,
            }
        }

        async function waitForSelectedCandidate() {
            const deadline = Date.now() + 10_000
            while (Date.now() < deadline) {
                const candidate = await selectedCandidate()
                if (candidate.localCandidateType && candidate.remoteCandidateType) return candidate
                await new Promise((resolve) => setTimeout(resolve, 100))
            }
            return await selectedCandidate()
        }

        peer.onicecandidate = (event) => {
            if (!event.candidate) return
            record(`candidate ${describeCandidate(event.candidate)}`)
            sendSignal({ type: 'candidate', candidate: event.candidate.toJSON() })
        }
        socket.onmessage = (event) => {
            void (async () => {
                try {
                    const signal = JSON.parse(String(event.data))
                    record(`receive ${signal.type}`)
                    if (signal.type === 'description') {
                        await peer.setRemoteDescription(signal.description)
                        if (signal.description.type === 'offer') {
                            await peer.setLocalDescription(await peer.createAnswer())
                            sendSignal({ type: 'description', description: peer.localDescription })
                        }
                        await flushCandidates()
                    }
                    if (signal.type === 'candidate') {
                        record(`receive-candidate ${describeCandidate(signal.candidate)}`)
                        if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate)
                        else pendingCandidates.push(signal.candidate)
                    }
                } catch (error) {
                    record(`signal-error ${error instanceof Error ? error.message : String(error)}`)
                }
            })()
        }

        ;(window as unknown as { __vibyStartHost: () => Promise<void> }).__vibyStartHost = async () => {
            if (role !== 'host') return
            channel = peer.createDataChannel('control', { ordered: true })
            resolveChannel(channel)
            await peer.setLocalDescription(await peer.createOffer())
            sendSignal({ type: 'description', description: peer.localDescription })
        }
        if (role === 'guest') {
            peer.ondatachannel = (event) => {
                channel = event.channel
                resolveChannel(event.channel)
            }
        }

        async function openChannel(): Promise<RTCDataChannel> {
            channel = await channelReady
            await waitForOpen(channel, 'datachannel')
            return channel
        }

        ;(window as unknown as { __vibyReadyForPings: () => Promise<void> }).__vibyReadyForPings = async () => {
            const open = await openChannel()
            if (role === 'host' && !hostEchoDone) hostEchoDone = echoPings(open)
        }

        ;(window as unknown as { __vibyFinishPeer: () => Promise<DirectSmokeResult> }).__vibyFinishPeer = async () => {
            const open = await openChannel()
            if (role === 'host') await hostEchoDone
            else await sendPings(open)

            const candidate = await waitForSelectedCandidate()
            socket.close()
            peer.close()
            return {
                role,
                ackCount: role === 'guest' ? samples.length : pingCount,
                elapsedMs: Date.now() - startedAt,
                p50RttMs: role === 'guest' ? percentile(samples, 0.5) : null,
                p95RttMs: role === 'guest' ? percentile(samples, 0.95) : null,
                maxRttMs: role === 'guest' ? Math.max(...samples) : 0,
                ...candidate,
            }
        }

        async function echoPings(openChannel: RTCDataChannel): Promise<void> {
            await new Promise<void>((resolve) => {
                openChannel.addEventListener('message', (event) => {
                    const payload = JSON.parse(String(event.data))
                    if (payload.kind === 'ping') {
                        openChannel.send(JSON.stringify({ kind: 'ack', seq: payload.seq, sentAt: payload.sentAt }))
                    }
                    if (payload.kind === 'done') resolve()
                })
            })
        }

        async function sendPings(openChannel: RTCDataChannel): Promise<void> {
            for (let seq = 0; seq < pingCount; seq += 1) {
                const sentAt = Date.now()
                openChannel.send(JSON.stringify({ kind: 'ping', seq, sentAt }))
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('ack timeout')), 5_000)
                    const onMessage = (event: MessageEvent) => {
                        const payload = JSON.parse(String(event.data))
                        if (payload.kind !== 'ack' || payload.seq !== seq) return
                        clearTimeout(timeout)
                        openChannel.removeEventListener('message', onMessage)
                        samples.push(Date.now() - sentAt)
                        resolve()
                    }
                    openChannel.addEventListener('message', onMessage)
                })
            }
            openChannel.send(JSON.stringify({ kind: 'done' }))
        }

        function percentile(values: number[], ratio: number): number | null {
            if (values.length === 0) return null
            const sorted = [...values].sort((left, right) => left - right)
            return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
        }

        await waitForOpen(socket, 'signaling')
    }, options)
}
