export function renderLandingPageMarkup(pairingId: string): string {
    return `<main>
    <div class="shell">
      <section class="hero">
        <p class="eyebrow">Viby Remote Pairing</p>
        <h1>手机接过来。会话继续跑。</h1>
        <p class="summary">公网 broker 只做一次性配对、signaling 和 ICE 配置。这一页连上后，真正的会话读写继续只走你电脑上的本地 Hub。</p>

        <div class="hero-grid">
          <div class="status-card">
            <div class="status-badge"><span class="status-dot"></span><span id="bridgeBadge">准备建立链路</span></div>
            <div id="status" class="status-copy">正在初始化配对…</div>
            <div class="actions">
              <button id="retry" type="button">重新连接</button>
              <button id="reloadSessions" class="secondary" type="button">刷新会话列表</button>
              <button id="reset" class="secondary" type="button">清除此设备配对</button>
            </div>
          </div>

          <div class="meta-card">
            <div class="meta-grid">
              <div class="meta-row">
                <span>Pairing ID</span>
                <strong>${pairingId}</strong>
              </div>
              <div class="meta-row">
                <span>Device Token</span>
                <strong id="deviceTokenState">尚未建立</strong>
              </div>
              <div class="meta-row">
                <span>Current Session</span>
                <strong id="currentSessionLabel">还没打开会话</strong>
              </div>
              <div class="meta-row">
                <span>Approval</span>
                <strong id="approvalState">等待扫码</strong>
              </div>
              <div class="meta-row">
                <span>Short Code</span>
                <strong id="shortCode">待生成</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="workspace">
        <aside class="sessions-panel">
          <h2 class="panel-title">会话列表</h2>
          <p class="panel-subtitle">这里只展示电脑上那一份 authoritative session。没有第二套手机侧持久化。</p>
          <div id="sessionList" class="session-list">
            <div class="empty">链路建好后，这里会出现当前电脑上的会话列表。</div>
          </div>
        </aside>

        <section class="detail-panel">
          <div class="detail-header">
            <div>
              <h2 id="detailTitle">还没打开会话</h2>
              <p id="detailSubtitle">先连上，再从左侧挑一个会话。这里只做单一控制链下的最小远程面板。</p>
            </div>
            <div class="detail-actions">
              <button id="resumeSession" class="secondary" type="button" disabled>恢复到这台电脑</button>
            </div>
          </div>

          <div id="detailMeta" class="detail-meta">
            <div class="detail-meta-card">
              <span>状态</span>
              <strong>等待连接</strong>
            </div>
          </div>

          <div id="messageList" class="message-list">
            <div class="empty">打开一个会话后，这里会显示最近的 transcript 和当前正在生成的流式内容。</div>
          </div>

          <div class="composer">
            <textarea id="composer" placeholder="给这台电脑上的当前会话发一条消息…" disabled></textarea>
            <div class="actions">
              <button id="sendMessage" type="button" disabled>发送消息</button>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>`
}
