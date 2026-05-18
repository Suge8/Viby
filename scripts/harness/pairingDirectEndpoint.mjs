import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const role = process.env.ROLE
const wsUrl = process.env.WS_URL
const readyUrl = process.env.BROKER_READY_URL
const iceServers = JSON.parse(process.env.ICE_SERVERS_JSON || '[]')
const pingCount = Number.parseInt(process.env.PING_COUNT || '12', 10)
const openTimeoutMs = Number.parseInt(process.env.PEER_OPEN_TIMEOUT_MS || '30000', 10)

if (role !== 'host' && role !== 'guest') throw new Error('ROLE must be host or guest')
if (!wsUrl) throw new Error('WS_URL is required')
if (!readyUrl) throw new Error('BROKER_READY_URL is required')

const chromeArgs = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--force-webrtc-ip-handling-policy=default_public_and_private_interfaces',
    '--ignore-certificate-errors',
    '--no-first-run',
    '--no-sandbox',
]

function commandPath(command) {
    const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' })
    return result.status === 0 ? result.stdout.trim() : null
}

function chromePath() {
    if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
    for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
        const path = commandPath(command)
        if (path) return path
    }
    const browserRoot = join(homedir(), '.agent-browser', 'browsers')
    if (!existsSync(browserRoot)) return null
    return (
        readdirSync(browserRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('chrome-'))
            .map((entry) =>
                join(
                    browserRoot,
                    entry.name,
                    'Google Chrome for Testing.app',
                    'Contents',
                    'MacOS',
                    'Google Chrome for Testing'
                )
            )
            .find((candidate) => existsSync(candidate)) ?? null
    )
}

async function loadChromium() {
    try {
        return (await import('playwright')).chromium
    } catch {
        return (await import('playwright-core')).chromium
    }
}

function launchOptions() {
    const executablePath = chromePath()
    return executablePath ? { executablePath, headless: true, args: chromeArgs } : { headless: true, args: chromeArgs }
}

async function main() {
    const chromium = await loadChromium()
    const browser = await chromium.launch(launchOptions())
    try {
        const page = await browser.newPage()
        await page.goto(readyUrl)
        await preparePeer(page, { role, wsUrl, iceServers, pingCount, openTimeoutMs })
        if (role === 'host') await page.evaluate(() => window.__vibyStartHost())
        const result = await page.evaluate(() => window.__vibyFinishPeer())
        console.log(JSON.stringify(result))
    } finally {
        await browser.close()
    }
}

async function preparePeer(page, options) {
    await page.evaluate(async ({ role, wsUrl, iceServers, pingCount, openTimeoutMs }) => {
        const samples = []
        const events = []
        const startedAt = Date.now()
        const socket = new WebSocket(wsUrl)
        const peer = new RTCPeerConnection({ iceServers })
        const pendingCandidates = []
        let channel = null
        let hostEchoDone = null
        let resolveChannel = () => {}
        const channelReady = new Promise((resolve) => {
            resolveChannel = resolve
        })

        function record(event) {
            events.push(`${Date.now() - startedAt}ms ${event}`)
        }

        function timeout(promise, ms, label) {
            return Promise.race([
                promise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`${label}; events=${events.join(' | ')}`)), ms)
                ),
            ])
        }

        function waitForOpen(target, label) {
            if (target.readyState === WebSocket.OPEN || target.readyState === 'open') return Promise.resolve()
            return timeout(
                new Promise((resolve, reject) => {
                    target.addEventListener('open', resolve, { once: true })
                    target.addEventListener('error', () => reject(new Error(`${label} error`)), { once: true })
                    target.addEventListener('close', () => reject(new Error(`${label} close`)), { once: true })
                }),
                openTimeoutMs,
                `${label} open timeout`
            )
        }

        function sendSignal(signal) {
            record(`send ${signal.type}`)
            socket.send(JSON.stringify(signal))
        }

        function describeCandidate(candidate) {
            return candidate.candidate?.match(/ typ ([a-z]+)/)?.[1] ?? 'unknown'
        }

        async function flushCandidates() {
            while (peer.remoteDescription && pendingCandidates.length > 0) {
                await peer.addIceCandidate(pendingCandidates.shift())
            }
        }

        async function selectedCandidate() {
            const stats = await peer.getStats()
            let selected = null
            stats.forEach((stat) => {
                if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') {
                    selected = stats.get(stat.selectedCandidatePairId) ?? selected
                }
                if (stat.type === 'candidate-pair' && stat.nominated && stat.state === 'succeeded') selected = stat
            })
            const local = selected?.localCandidateId ? stats.get(selected.localCandidateId) : null
            const remote = selected?.remoteCandidateId ? stats.get(selected.remoteCandidateId) : null
            return {
                localCandidateType: typeof local?.candidateType === 'string' ? local.candidateType : null,
                remoteCandidateType: typeof remote?.candidateType === 'string' ? remote.candidateType : null,
                selectedPairRttMs:
                    typeof selected?.currentRoundTripTime === 'number'
                        ? Math.round(selected.currentRoundTripTime * 1000)
                        : null,
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
        peer.addEventListener('icegatheringstatechange', () => record(`ice-gather ${peer.iceGatheringState}`))
        peer.addEventListener('iceconnectionstatechange', () => record(`ice ${peer.iceConnectionState}`))
        peer.addEventListener('connectionstatechange', () => record(`peer ${peer.connectionState}`))
        peer.ondatachannel = (event) => {
            if (role !== 'guest') return
            channel = event.channel
            resolveChannel(channel)
        }
        socket.onmessage = (event) => {
            void (async () => {
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
            })().catch((error) => record(`signal-error ${error.message}`))
        }

        window.__vibyStartHost = async () => {
            channel = peer.createDataChannel('control', { ordered: true })
            channel.addEventListener('open', () => record('datachannel open'))
            channel.addEventListener('close', () => record('datachannel close'))
            resolveChannel(channel)
            hostEchoDone = echoPings(channel)
            await peer.setLocalDescription(await peer.createOffer())
            sendSignal({ type: 'description', description: peer.localDescription })
        }

        async function openChannel() {
            const open = await channelReady
            await waitForOpen(open, 'datachannel')
            return open
        }

        async function echoPings(open) {
            await new Promise((resolve) => {
                let echoed = 0
                open.addEventListener('message', (event) => {
                    const payload = JSON.parse(String(event.data))
                    if (payload.kind === 'ping') {
                        open.send(JSON.stringify({ kind: 'ack', seq: payload.seq, sentAt: payload.sentAt }))
                        echoed += 1
                        if (echoed >= pingCount) resolve()
                    }
                    if (payload.kind === 'done') resolve()
                })
            })
        }

        async function sendPings(open) {
            for (let seq = 0; seq < pingCount; seq += 1) {
                const sentAt = Date.now()
                open.send(JSON.stringify({ kind: 'ping', seq, sentAt }))
                await timeout(
                    new Promise((resolve) => {
                        const onMessage = (event) => {
                            const payload = JSON.parse(String(event.data))
                            if (payload.kind !== 'ack' || payload.seq !== seq) return
                            open.removeEventListener('message', onMessage)
                            samples.push(Date.now() - sentAt)
                            resolve()
                        }
                        open.addEventListener('message', onMessage)
                    }),
                    5_000,
                    `ack ${seq} timeout`
                )
            }
            open.send(JSON.stringify({ kind: 'done' }))
        }

        function percentile(values, ratio) {
            if (values.length === 0) return null
            const sorted = [...values].sort((left, right) => left - right)
            return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))]
        }

        window.__vibyFinishPeer = async () => {
            const open = await openChannel()
            if (role === 'host') {
                hostEchoDone = hostEchoDone ?? echoPings(open)
                await timeout(hostEchoDone, 45_000, 'host echo timeout')
            } else {
                await sendPings(open)
            }
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
                events,
                ...candidate,
            }
        }

        await waitForOpen(socket, 'signaling')
    }, options)
}

await main()
