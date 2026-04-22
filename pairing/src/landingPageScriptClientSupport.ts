export const landingPageClientSupportScript = `
    function updateComposerState() {
      const interactivity = state.currentView && state.currentView.interactivity;
      const allowSend = Boolean(interactivity && (interactivity.lifecycleState === 'running' || interactivity.allowSendWhenInactive));
      composerEl.disabled = !allowSend;
      sendButton.disabled = !allowSend;
      const allowResume = Boolean(interactivity && interactivity.resumeAvailable && interactivity.lifecycleState !== 'running');
      resumeButton.disabled = !allowResume;
    }

    function renderSessions() {
      if (!state.sessions.length) {
        sessionListEl.innerHTML = '<div class="empty">当前没有可展示的会话。等这台电脑上的 Hub 产生会话后，这里会自动出现。</div>';
        return;
      }

      sessionListEl.innerHTML = state.sessions.map((session) => {
        const title = session.metadata && session.metadata.name ? session.metadata.name : (session.metadata ? session.metadata.path : session.id);
        const summary = session.metadata && session.metadata.summary ? session.metadata.summary.text : '还没有摘要。';
        return '<button type="button" class="session-item' + (session.id === state.currentSessionId ? ' is-active' : '') + '" data-session-id="' + escapeHtml(session.id) + '">' +
          '<div class="session-item-header"><h3>' + escapeHtml(title) + '</h3><span class="session-chip">' + escapeHtml(session.lifecycleState) + '</span></div>' +
          '<div class="session-meta">' + escapeHtml(summary) + '<br>driver: ' + escapeHtml(session.metadata && session.metadata.driver ? session.metadata.driver : 'unknown') + '<br>updated: ' + new Date(session.updatedAt).toLocaleString() + '</div>' +
        '</button>';
      }).join('');

      sessionListEl.querySelectorAll('[data-session-id]').forEach((node) => {
        node.addEventListener('click', () => {
          const sessionId = node.getAttribute('data-session-id');
          if (sessionId) {
            runTask(() => openSession(sessionId), '打开会话失败');
          }
        });
      });
    }

    function renderDetailMeta() {
      if (!state.currentView) {
        detailMetaEl.innerHTML = '<div class="detail-meta-card"><span>状态</span><strong>等待连接</strong></div>';
        return;
      }

      const session = state.currentView.session;
      const cards = [
        ['生命周期', state.currentView.interactivity.lifecycleState],
        ['可恢复', state.currentView.interactivity.resumeAvailable ? '可以' : '不需要'],
        ['模型', session.model || '默认'],
        ['Driver', session.metadata && session.metadata.driver ? session.metadata.driver : 'unknown']
      ];

      detailMetaEl.innerHTML = cards.map((entry) => '<div class="detail-meta-card"><span>' + escapeHtml(entry[0]) + '</span><strong>' + escapeHtml(entry[1]) + '</strong></div>').join('');
    }

    function extractMessageText(message) {
      const content = message && message.content;
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content.map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part.text === 'string') return part.text;
          if (part && part.data && part.data.message && typeof part.data.message.content === 'string') return part.data.message.content;
          return '';
        }).filter(Boolean).join('\\n');
      }
      if (content && typeof content.text === 'string') return content.text;
      if (content && content.data && content.data.message && typeof content.data.message.content === 'string') return content.data.message.content;
      return JSON.stringify(content, null, 2);
    }

    function normalizeMessageRole(message) {
      const content = message && message.content;
      if (content && typeof content.role === 'string') return content.role;
      if (content && content.data && content.data.message && typeof content.data.message.role === 'string') return content.data.message.role;
      return 'message';
    }

    function renderMessages() {
      if (!state.currentView) {
        messageListEl.innerHTML = '<div class="empty">打开一个会话后，这里会显示最近的 transcript 和当前正在生成的流式内容。</div>';
        return;
      }

      const renderedMessages = state.messages.map((message) => {
        const role = normalizeMessageRole(message);
        const text = extractMessageText(message);
        return '<article class="message role-' + escapeHtml(role) + '"><span class="message-role">' + escapeHtml(role) + '</span><div class="message-body">' + escapeHtml(text || '[empty message]') + '</div></article>';
      });

      if (state.stream && typeof state.stream.text === 'string' && state.stream.text) {
        renderedMessages.push('<div class="stream-box">' + escapeHtml(state.stream.text) + '</div>');
      }

      messageListEl.innerHTML = renderedMessages.join('') || '<div class="empty">这个会话还没有消息。</div>';
      messageListEl.scrollTop = messageListEl.scrollHeight;
    }

    function updateCurrentSessionLabel() {
      currentSessionLabelEl.textContent = state.currentView
        ? (state.currentView.session.metadata && state.currentView.session.metadata.name ? state.currentView.session.metadata.name : state.currentView.session.id)
        : '还没打开会话';
    }

    function applyPairingSnapshot(pairing) {
      state.pairing = pairing;
      renderPairingMeta();
      const pairingStatus = getPairingStatus(pairing);
      setStatus(pairingStatus.badge, pairingStatus.message);
    }

    function applyView(view) {
      state.currentView = view;
      state.messages = (view.latestWindow && view.latestWindow.messages ? view.latestWindow.messages.slice() : []);
      state.stream = view.stream || null;
      state.currentSessionId = view.session.id;
      detailTitleEl.textContent = view.session.metadata && view.session.metadata.name ? view.session.metadata.name : view.session.id;
      detailSubtitleEl.textContent = view.session.metadata && view.session.metadata.path ? view.session.metadata.path : '当前会话没有可展示的路径信息。';
      renderSessions();
      renderDetailMeta();
      renderMessages();
      updateCurrentSessionLabel();
      updateComposerState();
    }

    function mergeIncomingMessage(message) {
      if (!message || !state.currentSessionId) return;
      const existingIndex = state.messages.findIndex((entry) => entry.id === message.id);
      if (existingIndex >= 0) {
        state.messages.splice(existingIndex, 1, message);
      } else {
        state.messages.push(message);
        state.messages.sort((left, right) => {
          const leftSeq = typeof left.seq === 'number' ? left.seq : Number.MAX_SAFE_INTEGER;
          const rightSeq = typeof right.seq === 'number' ? right.seq : Number.MAX_SAFE_INTEGER;
          return leftSeq - rightSeq;
        });
      }
      renderMessages();
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      if (!response.ok) throw new Error(json && json.error ? json.error : '请求失败');
      return json;
    }

    async function reconnect(token, deviceProof) {
      return await postJson('/pairings/' + pairingId + '/reconnect', {
        token,
        challengeNonce: deviceProof ? deviceProof.challengeNonce : undefined,
        deviceProof
      });
    }

    async function requestReconnectChallenge(token) {
      return await postJson('/pairings/' + pairingId + '/reconnect-challenge', { token });
    }

    async function claim(ticket) {
      const identity = await loadPairingDeviceIdentity();
      return await postJson('/pairings/' + pairingId + '/claim', {
        ticket,
        label: navigator.userAgent.slice(0, 120),
        publicKey: identity.publicKey
      });
    }

    function resetPending(errorMessage) {
      for (const pending of state.pending.values()) pending.reject(new Error(errorMessage));
      state.pending.clear();
    }

    function cleanupBridge() {
      clearTimers();
      clearBridgeRecoveryTimer();
      resetPending('配对桥接已重置。');
      if (state.bridge) {
        state.bridge.dataChannel && state.bridge.dataChannel.close();
        state.bridge.signalSocket && state.bridge.signalSocket.close();
        state.bridge.peer && state.bridge.peer.close();
      }
      state.bridge = null;
      renderPairingMeta();
    }

    function handlePeerMessage(raw) {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      if (parsed.kind === 'response') {
        const pending = state.pending.get(parsed.id);
        if (!pending) return;
        state.pending.delete(parsed.id);
        if (parsed.ok) pending.resolve(parsed.result);
        else pending.reject(new Error(parsed.error && parsed.error.message ? parsed.error.message : '远程请求失败'));
        return;
      }

      if (parsed.kind === 'event' && parsed.event === 'sync-event') {
        const event = parsed.payload;
        if (!event || typeof event.type !== 'string') return;
        if (event.type === 'session-added' || event.type === 'session-updated' || event.type === 'session-removed') {
          scheduleRefreshSessions();
        }
        if (state.currentSessionId && event.sessionId === state.currentSessionId) {
          if (event.type === 'message-received') mergeIncomingMessage(event.message);
          else if (event.type === 'session-stream-updated') {
            state.stream = event.stream;
            renderMessages();
          } else if (event.type === 'session-stream-cleared') {
            state.stream = null;
            renderMessages();
          } else if (event.type === 'session-updated') {
            scheduleRefreshCurrent();
          }
        }
      }
    }

    function rpc(method, params) {
      if (!state.bridge || !state.bridge.dataChannel || state.bridge.dataChannel.readyState !== 'open') {
        return Promise.reject(new Error('点对点链路还没 ready。'));
      }

      state.requestSeq += 1;
      const id = 'req-' + state.requestSeq;
      return new Promise((resolve, reject) => {
        state.pending.set(id, { resolve, reject });
        state.bridge.dataChannel.send(JSON.stringify({ kind: 'request', id, method, params }));
      });
    }

    async function refreshSessions() {
      const result = await rpc('sessions.list', {});
      state.sessions = Array.isArray(result.sessions) ? result.sessions : [];
      renderSessions();
    }

    async function openSession(sessionId) {
      detailTitleEl.textContent = '正在打开…';
      detailSubtitleEl.textContent = sessionId;
      applyView(await rpc('session.open', { sessionId }));
    }

    async function refreshCurrentSession() {
      if (state.currentSessionId) applyView(await rpc('session.open', { sessionId: state.currentSessionId }));
    }

    async function resumeCurrentSession() {
      if (state.currentSessionId) applyView(await rpc('session.resume', { sessionId: state.currentSessionId }));
    }

    async function sendCurrentMessage() {
      if (!state.currentSessionId) return;
      const text = composerEl.value.trim();
      if (!text) return;
      sendButton.disabled = true;
      try {
        await rpc('session.send', {
          sessionId: state.currentSessionId,
          text,
          localId: self.crypto && typeof self.crypto.randomUUID === 'function' ? self.crypto.randomUUID() : 'mobile-' + Date.now()
        });
        composerEl.value = '';
        await refreshCurrentSession();
      } finally {
        updateComposerState();
      }
    }
`
