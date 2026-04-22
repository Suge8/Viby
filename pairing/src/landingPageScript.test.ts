import { describe, expect, it } from 'bun:test'
import { renderPairingLandingHtml } from './landingPage'
import { renderLandingPageScript } from './landingPageScript'
import { landingPageTransportScript } from './landingPageScriptTransport'
import { renderLandingPageUiScript } from './landingPageScriptUi'

describe('pairing landing page script', () => {
    it('renders a narrow remote shell that only targets the authoritative desktop session surface', () => {
        const script = renderLandingPageUiScript('pairing-123')

        expect(script).toContain('const pairingId = "pairing-123";')
        expect(script).toContain("const tokenKey = 'viby:pairing:' + pairingId + ':guest-token';")
        expect(script).toContain("rpc('sessions.list', {})")
        expect(script).toContain("rpc('session.open', { sessionId })")
        expect(script).toContain("rpc('session.resume', { sessionId: state.currentSessionId })")
        expect(script).toContain("rpc('session.send', {")
        expect(script).toContain("runTask(() => refreshSessions(), '会话刷新失败');")
        expect(script).toContain("runTask(() => openSession(sessionId), '打开会话失败');")
        expect(script).not.toContain('indexedDB')
        expect(script).not.toContain('sessionStorage')
    })

    it('keeps sync-event handling event-driven and limited to session list plus current transcript', () => {
        const script = renderLandingPageUiScript('pairing-456')

        expect(script).toContain("if (parsed.kind === 'event' && parsed.event === 'sync-event')")
        expect(script).toContain(
            "if (event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed')"
        )
        expect(script).toContain("if (event.type === 'message-received') mergeIncomingMessage(event.message);")
        expect(script).toContain("else if (event.type === 'session-stream-updated')")
        expect(script).toContain("else if (event.type === 'session-stream-cleared')")
        expect(script).toContain("else if (event.type === 'session-updated')")
        expect(script).toContain('messageListEl.scrollTop = messageListEl.scrollHeight;')
        expect(script).toContain('state.pending.set(id, { resolve, reject });')
        expect(script).not.toContain("fetch('/api/sessions'")
    })

    it('keeps transport bootstrap on short-lived ticket claim plus reconnect token reuse', () => {
        const script = renderLandingPageScript('pairing-transport')

        expect(script).toContain('const peer = new RTCPeerConnection({')
        expect(script).toContain('const signalSocket = new WebSocket(pairing.wsUrl);')
        expect(script).toContain("const deviceKeyKey = 'viby:pairing:' + pairingId + ':device-key';")
        expect(script).toContain('const deviceIdentity = await loadPairingDeviceIdentity();')
        expect(script).toContain('const challenge = await requestReconnectChallenge(cachedToken);')
        expect(script).toContain(
            'pairing = await reconnect(cachedToken, await createReconnectDeviceProof(deviceIdentity, challenge.challenge.nonce));'
        )
        expect(script).toContain('const cachedToken = window.localStorage.getItem(tokenKey);')
        expect(script).toContain('pairing = await claim(ticket);')
        expect(script).toContain('window.localStorage.setItem(tokenKey, pairing.guestToken);')
        expect(script).toContain('publicKey: identity.publicKey')
        expect(script).toContain('challengeNonce: deviceProof ? deviceProof.challengeNonce : undefined')
        expect(script).toContain("history.replaceState({}, '', window.location.pathname);")
        expect(script).toContain("signalSocket.send(JSON.stringify({ pairingId, type: 'join' }));")
        expect(script).toContain("if (signal.type === 'offer') {")
        expect(script).toContain("if (signal.type === 'peer-left') {")
        expect(script).toContain("if (signal.type === 'candidate') {")
        expect(script).toContain("if (signal.type === 'expire') {")
        expect(script).not.toContain('EventSource')
    })

    it('wraps user-triggered async actions in explicit catch paths instead of fire-and-forget void calls', () => {
        const script = landingPageTransportScript

        expect(script).toContain('boot().catch((error) => {')
        expect(script).toContain('refreshSessions().catch((error) => {')
        expect(script).toContain('resumeCurrentSession().catch((error) => {')
        expect(script).toContain('sendCurrentMessage().catch((error) => {')
        expect(script).not.toContain('void boot().catch')
        expect(script).not.toContain('void refreshSessions().catch')
        expect(script).not.toContain('void resumeCurrentSession().catch')
        expect(script).not.toContain('void sendCurrentMessage().catch')
    })

    it('assembles the final html with the remote shell markup and embedded script owners', () => {
        const html = renderPairingLandingHtml('pairing-final')
        const script = renderLandingPageScript('pairing-final')

        expect(html).toContain('<h1>手机接过来。会话继续跑。</h1>')
        expect(html).toContain('这里只展示电脑上那一份 authoritative session。')
        expect(html).toContain('id="sessionList"')
        expect(html).toContain('id="messageList"')
        expect(html).toContain('id="composer"')
        expect(html).toContain(script)
        expect(html).toContain('navigator.userAgent.slice(0, 120)')
        expect(html).toContain('点对点控制链路已建立')
    })
})
