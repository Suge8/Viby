import { describe, expect, it, mock } from 'bun:test'
import type { PairingSessionSnapshot } from '@/types'
import { attachPairingDataChannel, handlePairingSignalMessage } from './pairingBridgeControllerSupport'

type Listener = () => void
type SignalHandlerOptions = Partial<Parameters<typeof handlePairingSignalMessage>[0]>

class FakeDataChannel {
    readyState: RTCDataChannelState = 'open'
    private readonly listeners = new Map<string, Listener[]>()

    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
    }

    emit(type: string): void {
        for (const listener of this.listeners.get(type) ?? []) listener()
    }
}

function createSnapshot(overrides: Partial<PairingSessionSnapshot> = {}): PairingSessionSnapshot {
    return {
        id: 'pairing-1',
        state: 'connected',
        createdAt: 1,
        updatedAt: 2,
        expiresAt: 3,
        ticketExpiresAt: 4,
        shortCode: '123456',
        approvalStatus: 'approved',
        host: { tokenHint: 'host-1' },
        guest: { tokenHint: 'guest-1' },
        ...overrides,
    }
}

function attachChannelForCloseTest(options: {
    channel: FakeDataChannel
    client?: { closeAllTerminals: () => void }
    schedulePeerRecovery?: () => void
    stopEventStream?: () => void
    stopHealth?: () => void
    suppress?: boolean
    reportPairingPresence?: (alive: boolean) => void
}): void {
    attachPairingDataChannel({
        nextChannel: options.channel as unknown as RTCDataChannel,
        client: (options.client ?? { closeAllTerminals: () => undefined }) as never,
        isDisposed: () => false,
        getSuppressTransportClose: () => options.suppress ?? false,
        setBridgeState: () => undefined,
        stopEventStream: options.stopEventStream ?? (() => undefined),
        startEventStream: async () => undefined,
        reportPairingPresence: options.reportPairingPresence ?? (() => undefined),
        schedulePeerRecovery: options.schedulePeerRecovery ?? (() => undefined),
        channelHealth: {
            isHealthy: () => true,
            noteInbound: () => false,
            start: () => undefined,
            stop: options.stopHealth ?? (() => undefined),
        },
        reportAsyncError: () => undefined,
    })
}

async function handleSignal(signal: Record<string, unknown>, options: SignalHandlerOptions = {}): Promise<void> {
    const snapshot = options.pairingSnapshot ?? createSnapshot()
    const pairingId = options.pairingId ?? snapshot.id
    await handlePairingSignalMessage({
        event: { data: JSON.stringify({ pairingId, ...signal }) } as MessageEvent<string>,
        activePeer: { connectionState: 'connected' } as RTCPeerConnection,
        pairingId,
        pairingSnapshot: snapshot,
        signalSocket: null,
        setBridgeState: () => undefined,
        scheduleReconnect: () => undefined,
        closeTransport: () => undefined,
        ensureOffer: async () => undefined,
        ...options,
    })
}

describe('pairingBridgeControllerSupport', () => {
    it('turns guest peer-left into paused recovery without closing the pairing session', async () => {
        const setBridgeState = mock(() => undefined)
        const scheduleReconnect = mock(() => undefined)
        const closeTransport = mock(() => undefined)
        const schedulePeerRecovery = mock(() => undefined)
        const snapshot = createSnapshot({ state: 'claimed', guest: { tokenHint: 'guest-1', lastSeenAt: 10 } })

        await handleSignal(
            { type: 'peer-left', payload: { pairing: snapshot } },
            {
                activePeer: { connectionState: 'disconnected' } as RTCPeerConnection,
                pairingSnapshot: snapshot,
                setBridgeState,
                scheduleReconnect,
                closeTransport,
                schedulePeerRecovery,
            }
        )

        expect(setBridgeState).toHaveBeenCalledWith({
            phase: 'paused',
            message: '设备链路暂时中断，正在自动接回。',
            pairing: snapshot,
        })
        expect(schedulePeerRecovery).toHaveBeenCalled()
        expect(scheduleReconnect).not.toHaveBeenCalled()
        expect(closeTransport).not.toHaveBeenCalled()
    })

    it('keeps data channel close in paused recovery without flipping hub presence', () => {
        const channel = new FakeDataChannel()
        const schedulePeerRecovery = mock(() => undefined)
        const stopEventStream = mock(() => undefined)
        const reportPairingPresence = mock((_alive: boolean) => undefined)
        const client = { closeAllTerminals: mock(() => undefined) }

        attachChannelForCloseTest({
            channel,
            client,
            schedulePeerRecovery,
            stopEventStream,
            reportPairingPresence,
        })
        channel.emit('close')

        expect(stopEventStream).toHaveBeenCalled()
        expect(client.closeAllTerminals).toHaveBeenCalled()
        expect(schedulePeerRecovery).toHaveBeenCalled()
        // Transport close means the bridge is entering paused recovery, not
        // that the device has left. Hub presence must stay true so the desktop
        // popover keeps showing the device with a “等待回连” status while the
        // phone roams between networks; only dispose flips presence inactive.
        expect(reportPairingPresence).not.toHaveBeenCalled()
    })

    it('emits pairing presence alive=true when the data channel opens', () => {
        const channel = new FakeDataChannel()
        const reportPairingPresence = mock((_alive: boolean) => undefined)

        attachChannelForCloseTest({ channel, reportPairingPresence })
        channel.emit('open')

        expect(reportPairingPresence).toHaveBeenCalledWith(true)
    })

    it('ignores close events from a stale suppressed data channel', () => {
        const channel = new FakeDataChannel()
        const schedulePeerRecovery = mock(() => undefined)
        const stopEventStream = mock(() => undefined)
        const stopHealth = mock(() => undefined)
        const reportPairingPresence = mock((_alive: boolean) => undefined)
        const client = { closeAllTerminals: mock(() => undefined) }

        attachChannelForCloseTest({
            channel,
            client,
            schedulePeerRecovery,
            stopEventStream,
            stopHealth,
            suppress: true,
            reportPairingPresence,
        })
        channel.emit('close')

        expect(stopHealth).not.toHaveBeenCalled()
        expect(stopEventStream).not.toHaveBeenCalled()
        expect(client.closeAllTerminals).not.toHaveBeenCalled()
        expect(schedulePeerRecovery).not.toHaveBeenCalled()
        expect(reportPairingPresence).not.toHaveBeenCalled()
    })

    it('requests a fresh offer when the peer rejoins while transport is not connected', async () => {
        const resetOfferState = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const activePeer = { connectionState: 'disconnected' } as RTCPeerConnection
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', payload: { pairing: snapshot } },
            { activePeer, ensureOffer, resetOfferState }
        )

        expect(resetOfferState).toHaveBeenCalled()
        expect(ensureOffer).toHaveBeenCalledWith(activePeer)
    })

    it('prefers ICE restart when the phone returns to a disconnected peer', async () => {
        const resetOfferState = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const tryIceRestart = mock(() => true)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', payload: { pairing: snapshot } },
            {
                activePeer: { connectionState: 'disconnected' } as RTCPeerConnection,
                ensureOffer,
                tryIceRestart,
                resetOfferState,
            }
        )

        expect(tryIceRestart).toHaveBeenCalledWith('设备已回来，正在刷新点对点链路。')
        expect(resetOfferState).not.toHaveBeenCalled()
        expect(ensureOffer).not.toHaveBeenCalled()
    })

    it('rebuilds immediately when the phone rejoins after the old data channel closed', async () => {
        const scheduleReconnect = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const resetOfferState = mock(() => undefined)
        const setBridgeState = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', payload: { pairing: snapshot } },
            {
                getChannel: () => ({ readyState: 'closed' }) as RTCDataChannel,
                setBridgeState,
                scheduleReconnect,
                ensureOffer,
                resetOfferState,
            }
        )

        expect(resetOfferState).toHaveBeenCalled()
        expect(scheduleReconnect).toHaveBeenCalledWith('设备已回来，正在重建安全链路。')
        expect(ensureOffer).not.toHaveBeenCalled()
        expect(setBridgeState).not.toHaveBeenCalled()
    })

    it('records the first guest transport and offers without rebuilding the initial connection', async () => {
        const rebuildTransport = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const setGuestTransportId = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', from: 'guest', payload: { pairing: snapshot, transportId: 'guest-first' } },
            {
                activePeer: { connectionState: 'connecting' } as RTCPeerConnection,
                ensureOffer,
                rebuildTransport,
                getGuestTransportId: () => null,
                setGuestTransportId,
                resetOfferState: () => undefined,
                getChannel: () => ({ readyState: 'connecting' }) as RTCDataChannel,
            }
        )

        expect(setGuestTransportId).toHaveBeenCalledWith('guest-first')
        expect(rebuildTransport).not.toHaveBeenCalled()
        expect(ensureOffer).toHaveBeenCalled()
    })

    it('rebuilds when a refreshed phone joins with a new guest transport even if the old channel looks healthy', async () => {
        const scheduleReconnect = mock(() => undefined)
        const rebuildTransport = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const resetOfferState = mock(() => undefined)
        const setBridgeState = mock(() => undefined)
        const setGuestTransportId = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', from: 'guest', payload: { pairing: snapshot, transportId: 'guest-new' } },
            {
                activePeer: { connectionState: 'connected' } as RTCPeerConnection,
                rebuildTransport,
                getGuestTransportId: () => 'guest-old',
                setGuestTransportId,
                resetOfferState,
                getChannel: () => ({ readyState: 'open' }) as RTCDataChannel,
                setBridgeState,
                scheduleReconnect,
                ensureOffer,
            }
        )

        expect(setGuestTransportId).toHaveBeenCalledWith('guest-new')
        expect(resetOfferState).toHaveBeenCalled()
        expect(rebuildTransport).toHaveBeenCalledWith('设备已回来，正在重建安全链路。')
        expect(scheduleReconnect).not.toHaveBeenCalled()
        expect(ensureOffer).not.toHaveBeenCalled()
        expect(setBridgeState).not.toHaveBeenCalled()
    })

    it('keeps a healthy transport when the same guest transport only rejoins signaling', async () => {
        const scheduleReconnect = mock(() => undefined)
        const rebuildTransport = mock(() => undefined)
        const ensureOffer = mock(async () => undefined)
        const resetOfferState = mock(() => undefined)
        const setBridgeState = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'ready', from: 'guest', payload: { pairing: snapshot, transportId: 'guest-same' } },
            {
                getGuestTransportId: () => 'guest-same',
                setGuestTransportId: () => undefined,
                resetOfferState,
                getChannel: () => ({ readyState: 'open' }) as RTCDataChannel,
                isChannelHealthy: () => true,
                setBridgeState,
                scheduleReconnect,
                rebuildTransport,
                ensureOffer,
            }
        )

        expect(rebuildTransport).not.toHaveBeenCalled()
        expect(scheduleReconnect).not.toHaveBeenCalled()
        expect(resetOfferState).not.toHaveBeenCalled()
        expect(ensureOffer).not.toHaveBeenCalled()
        expect(setBridgeState).toHaveBeenCalledWith({ phase: 'ready', message: '设备链路已接通。', pairing: snapshot })
    })

    it('keeps an open data channel presented as ready during transient ICE disconnected state updates', async () => {
        const setBridgeState = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'state', payload: { pairing: snapshot } },
            {
                activePeer: { connectionState: 'disconnected' } as RTCPeerConnection,
                getChannel: () => ({ readyState: 'open' }) as RTCDataChannel,
                isChannelHealthy: () => true,
                setBridgeState,
            }
        )

        expect(setBridgeState).toHaveBeenCalledWith({ phase: 'ready', message: '设备链路已接通。', pairing: snapshot })
    })

    it('does not report ready from a peer-only state update when the data channel is closed', async () => {
        const setBridgeState = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal(
            { type: 'state', payload: { pairing: snapshot } },
            { setBridgeState, getChannel: () => ({ readyState: 'closed' }) as RTCDataChannel }
        )

        expect(setBridgeState).toHaveBeenCalledWith({
            phase: 'connecting',
            message: '正在建立点对点链路。',
            pairing: snapshot,
        })
    })

    it('does not report ready from peer-only late state updates', async () => {
        const setBridgeState = mock(() => undefined)
        const snapshot = createSnapshot()

        await handleSignal({ type: 'state', payload: { pairing: snapshot } }, { setBridgeState })

        expect(setBridgeState).toHaveBeenCalledWith({
            phase: 'connecting',
            message: '已绑定设备，等待设备页面接入。',
            pairing: snapshot,
        })
    })
})
