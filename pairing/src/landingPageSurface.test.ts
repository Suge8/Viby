import { describe, expect, it } from 'bun:test'
import { renderPairingLandingHtml } from './landingPage'
import { renderLandingPageMarkup } from './landingPageMarkup'
import { landingPageStylesBase } from './landingPageStylesBase'
import { landingPageStylesSurface } from './landingPageStylesSurface'

describe('pairing landing page surface contract', () => {
    it('keeps every interactive owner id required by the embedded remote shell markup', () => {
        const markup = renderLandingPageMarkup('pairing-ids')

        expect(markup).toContain('id="bridgeBadge"')
        expect(markup).toContain('id="status"')
        expect(markup).toContain('id="retry"')
        expect(markup).toContain('id="reloadSessions"')
        expect(markup).toContain('id="reset"')
        expect(markup).toContain('id="deviceTokenState"')
        expect(markup).toContain('id="currentSessionLabel"')
        expect(markup).toContain('id="sessionList"')
        expect(markup).toContain('id="detailTitle"')
        expect(markup).toContain('id="detailSubtitle"')
        expect(markup).toContain('id="detailMeta"')
        expect(markup).toContain('id="messageList"')
        expect(markup).toContain('id="resumeSession"')
        expect(markup).toContain('id="composer"')
        expect(markup).toContain('id="sendMessage"')
        expect(markup).toContain('Pairing ID')
        expect(markup).toContain('Device Token')
        expect(markup).toContain('Current Session')
    })

    it('keeps the remote-shell copy explicitly constrained to a single desktop authority chain', () => {
        const markup = renderLandingPageMarkup('pairing-copy')

        expect(markup).toContain('公网 broker 只做一次性配对、signaling 和 ICE 配置。')
        expect(markup).toContain('真正的会话读写继续只走你电脑上的本地 Hub。')
        expect(markup).toContain('这里只展示电脑上那一份 authoritative session。')
        expect(markup).toContain('没有第二套手机侧持久化。')
        expect(markup).toContain('这里只做单一控制链下的最小远程面板。')
        expect(markup).toContain('给这台电脑上的当前会话发一条消息…')
        expect(markup).not.toContain('同步到云端')
        expect(markup).not.toContain('手机本地数据库')
    })

    it('keeps the base styles responsible for atmosphere, typography, and control primitives', () => {
        expect(landingPageStylesBase).toContain('--bg: #eef4ed;')
        expect(landingPageStylesBase).toContain('--accent: #1f7a45;')
        expect(landingPageStylesBase).toContain(
            'font-family: "SF Pro Display", "Segoe UI Variable", "Helvetica Neue", sans-serif;'
        )
        expect(landingPageStylesBase).toContain(
            'radial-gradient(circle at top left, rgba(31, 122, 69, 0.18), transparent 34%)'
        )
        expect(landingPageStylesBase).toContain('linear-gradient(180deg, #f8fbf8 0%, var(--bg) 100%)')
        expect(landingPageStylesBase).toContain('.hero,')
        expect(landingPageStylesBase).toContain('.workspace {')
        expect(landingPageStylesBase).toContain('backdrop-filter: blur(18px);')
        expect(landingPageStylesBase).toContain('.status-badge {')
        expect(landingPageStylesBase).toContain('button.secondary {')
    })

    it('keeps the surface styles aligned with the split session list and detail panel layout', () => {
        expect(landingPageStylesSurface).toContain('.workspace {')
        expect(landingPageStylesSurface).toContain('grid-template-columns: 320px minmax(0, 1fr);')
        expect(landingPageStylesSurface).toContain('.sessions-panel {')
        expect(landingPageStylesSurface).toContain('.detail-panel {')
        expect(landingPageStylesSurface).toContain('grid-template-rows: auto auto 1fr auto;')
        expect(landingPageStylesSurface).toContain('.session-list {')
        expect(landingPageStylesSurface).toContain('.session-item.is-active {')
        expect(landingPageStylesSurface).toContain('.detail-meta {')
        expect(landingPageStylesSurface).toContain('.message-list {')
        expect(landingPageStylesSurface).toContain('.stream-box {')
        expect(landingPageStylesSurface).toContain('.composer {')
        expect(landingPageStylesSurface).toContain('@media (max-width: 920px) {')
    })

    it('embeds both style owners in the final html so the page can ship as a single-file remote shell', () => {
        const html = renderPairingLandingHtml('pairing-html')

        expect(html).toContain('<style>')
        expect(html).toContain(landingPageStylesBase)
        expect(html).toContain(landingPageStylesSurface)
        expect(html).toContain('<script>')
        expect(html).toContain('pairing-html')
        expect(html).toContain('id="sessionList"')
        expect(html).toContain('id="messageList"')
        expect(html).toContain('id="composer"')
        expect(html).toContain('</html>')
    })

    it('keeps markup class hooks aligned with the split style owners to avoid shell drift', () => {
        const markup = renderLandingPageMarkup('pairing-classes')

        expect(markup).toContain('class="shell"')
        expect(markup).toContain('class="hero"')
        expect(markup).toContain('class="hero-grid"')
        expect(markup).toContain('class="status-card"')
        expect(markup).toContain('class="meta-card"')
        expect(markup).toContain('class="workspace"')
        expect(markup).toContain('class="sessions-panel"')
        expect(markup).toContain('class="panel-title"')
        expect(markup).toContain('class="panel-subtitle"')
        expect(markup).toContain('class="detail-panel"')
        expect(markup).toContain('class="detail-header"')
        expect(markup).toContain('class="detail-actions"')
        expect(markup).toContain('class="detail-meta"')
        expect(markup).toContain('class="message-list"')
        expect(markup).toContain('class="composer"')
        expect(landingPageStylesBase).toContain('.hero-grid {')
        expect(landingPageStylesBase).toContain('.status-card,')
        expect(landingPageStylesBase).toContain('.meta-card,')
        expect(landingPageStylesSurface).toContain('.sessions-panel {')
        expect(landingPageStylesSurface).toContain('.detail-panel {')
        expect(landingPageStylesSurface).toContain('.detail-header {')
        expect(landingPageStylesSurface).toContain('.detail-actions {')
        expect(landingPageStylesSurface).toContain('.detail-meta {')
        expect(landingPageStylesSurface).toContain('.message-list {')
        expect(landingPageStylesSurface).toContain('.composer {')
    })

    it('keeps the operational controls visible in the markup copy for reconnect and manual recovery', () => {
        const markup = renderLandingPageMarkup('pairing-actions')

        expect(markup).toContain('重新连接')
        expect(markup).toContain('刷新会话列表')
        expect(markup).toContain('清除此设备配对')
        expect(markup).toContain('恢复到这台电脑')
        expect(markup).toContain('发送消息')
        expect(markup).toContain('链路建好后，这里会出现当前电脑上的会话列表。')
        expect(markup).toContain('打开一个会话后，这里会显示最近的 transcript 和当前正在生成的流式内容。')
    })
})
