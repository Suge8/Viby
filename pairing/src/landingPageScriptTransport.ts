export const landingPageTransportScript = `
    function clearBridgeRecoveryTimer() {
      if (state.bridgeRecoveryTimer) {
        clearTimeout(state.bridgeRecoveryTimer);
        state.bridgeRecoveryTimer = null;
      }
    }

    function scheduleBridgeRecovery(message) {
      clearBridgeRecoveryTimer();
      setStatus('正在重建链路', message);
      state.bridgeRecoveryTimer = setTimeout(() => {
        state.bridgeRecoveryTimer = null;
        boot().catch((error) => {
          cleanupBridge();
          setStatus('连接失败', error instanceof Error ? error.message : String(error));
        });
      }, 1200);
    }

    async function connectRemote(pairing) {
      cleanupBridge();
      applyPairingSnapshot(pairing);

      const peer = new RTCPeerConnection({
        iceServers: Array.isArray(pairing.iceServers) ? pairing.iceServers : []
      });
      const signalSocket = new WebSocket(pairing.wsUrl);

      state.bridge = { peer, signalSocket, dataChannel: null, connected: false };

      const socketReady = new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error('配对信令建立超时。')), 15000);
        const finish = (fn, value) => {
          clearTimeout(timeoutId);
          fn(value);
        };

        peer.addEventListener('icecandidate', (event) => {
          if (!event.candidate || signalSocket.readyState !== WebSocket.OPEN) return;
          signalSocket.send(JSON.stringify({
            pairingId,
            type: 'candidate',
            to: 'host',
            payload: { candidate: event.candidate.toJSON() }
          }));
        });

        peer.addEventListener('datachannel', (event) => {
          const dataChannel = event.channel;
          state.bridge.dataChannel = dataChannel;
          dataChannel.addEventListener('open', () => {
            state.bridge.connected = true;
            applyPairingSnapshot(state.pairing);
            refreshSessions().catch((error) => {
              setStatus('刷新失败', error instanceof Error ? error.message : String(error));
            });
          });
          dataChannel.addEventListener('close', () => {
            state.bridge.connected = false;
            applyPairingSnapshot(state.pairing);
          });
          dataChannel.addEventListener('message', (messageEvent) => {
            if (typeof messageEvent.data === 'string') handlePeerMessage(messageEvent.data);
          });
        });

        peer.addEventListener('connectionstatechange', () => {
          if (peer.connectionState === 'failed') {
            if (!state.bridge || !state.bridge.connected) {
              finish(reject, new Error('点对点链路失败。'));
              return;
            }
            scheduleBridgeRecovery('点对点链路失败，正在重新建立。');
            return;
          }
          if (peer.connectionState === 'disconnected' && state.bridge && state.bridge.connected) {
            scheduleBridgeRecovery('点对点链路断开，正在尝试恢复。');
          }
        });

        signalSocket.addEventListener('open', () => {
          signalSocket.send(JSON.stringify({ pairingId, type: 'join' }));
          finish(resolve);
        });

        signalSocket.addEventListener('message', async (socketEvent) => {
          let signal;
          try {
            signal = JSON.parse(socketEvent.data);
          } catch {
            return;
          }
          if (!signal || signal.pairingId !== pairingId) return;

          if (signal.type === 'state') {
            if (signal.payload && signal.payload.pairing) applyPairingSnapshot({ pairing: signal.payload.pairing });
            return;
          }

          if (signal.type === 'offer') {
            await peer.setRemoteDescription(signal.payload);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            signalSocket.send(JSON.stringify({
              pairingId,
              type: 'answer',
              to: 'host',
              payload: answer
            }));
            return;
          }

          if (signal.type === 'ready') {
            if (signal.payload && signal.payload.pairing) applyPairingSnapshot({ pairing: signal.payload.pairing });
            return;
          }

          if (signal.type === 'peer-left') {
            if (signal.payload && signal.payload.pairing) applyPairingSnapshot({ pairing: signal.payload.pairing });
            scheduleBridgeRecovery('桌面链路已离开，正在等待它重新接回。');
            return;
          }

          if (signal.type === 'candidate') {
            const candidatePayload = signal.payload && signal.payload.candidate ? signal.payload.candidate : signal.payload;
            if (candidatePayload) await peer.addIceCandidate(candidatePayload);
            return;
          }

          if (signal.type === 'expire') {
            finish(reject, new Error('配对已过期或被删除。'));
            return;
          }

          if (signal.type === 'error') {
            finish(reject, new Error(signal.payload && signal.payload.message ? signal.payload.message : '配对信令失败。'));
          }
        });

        signalSocket.addEventListener('close', () => {
          if (state.bridge && state.bridge.signalSocket === signalSocket && !state.bridge.connected) {
            finish(reject, new Error('配对信令已关闭。'));
          }
        });

        signalSocket.addEventListener('error', () => {
          finish(reject, new Error('配对信令出错。'));
        });
      });

      await socketReady;
    }

    async function boot() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const ticket = hash.get('ticket');
      const cachedToken = window.localStorage.getItem(tokenKey);
      const deviceIdentity = await loadPairingDeviceIdentity();
      let pairing = null;

      if (cachedToken) {
        try {
          const challenge = await requestReconnectChallenge(cachedToken);
          pairing = await reconnect(cachedToken, await createReconnectDeviceProof(deviceIdentity, challenge.challenge.nonce));
          deviceTokenStateEl.textContent = '已保存，可自动重连';
        } catch (error) {
          window.localStorage.removeItem(tokenKey);
          deviceTokenStateEl.textContent = '旧令牌失效';
          setStatus('旧令牌失效', '旧设备令牌失效，正在尝试重新消费一次性票据…\\n\\n' + String(error));
        }
      }

      if (!pairing) {
        if (!ticket) {
          deviceTokenStateEl.textContent = '缺少票据';
          setStatus('缺少票据', '当前页面没有可用的一次性票据。请从桌面端重新扫码。');
          return;
        }

        pairing = await claim(ticket);
        window.localStorage.setItem(tokenKey, pairing.guestToken);
        history.replaceState({}, '', window.location.pathname);
        deviceTokenStateEl.textContent = '已保存，可自动重连';
      }

      applyPairingSnapshot(pairing);
      await connectRemote(pairing);
    }

    retryButton.addEventListener('click', () => {
      boot().catch((error) => {
        cleanupBridge();
        setStatus('连接失败', error instanceof Error ? error.message : String(error));
      });
    });

    reloadSessionsButton.addEventListener('click', () => {
      refreshSessions().catch((error) => {
        setStatus('刷新失败', error instanceof Error ? error.message : String(error));
      });
    });

    resumeButton.addEventListener('click', () => {
      resumeCurrentSession().catch((error) => {
        setStatus('恢复失败', error instanceof Error ? error.message : String(error));
      });
    });

    sendButton.addEventListener('click', () => {
      sendCurrentMessage().catch((error) => {
        setStatus('发送失败', error instanceof Error ? error.message : String(error));
        updateComposerState();
      });
    });

    composerEl.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        sendCurrentMessage().catch((error) => {
          setStatus('发送失败', error instanceof Error ? error.message : String(error));
          updateComposerState();
        });
      }
    });

    resetButton.addEventListener('click', () => {
      window.localStorage.removeItem(tokenKey);
      clearPairingDeviceIdentity();
      deviceTokenStateEl.textContent = '已清除';
      cleanupBridge();
      state.sessions = [];
      state.currentSessionId = null;
      state.currentView = null;
      state.messages = [];
      state.stream = null;
      state.pairing = null;
      renderSessions();
      renderDetailMeta();
      renderMessages();
      updateCurrentSessionLabel();
      updateComposerState();
      renderPairingMeta();
      setStatus('设备配对已清除', '当前手机的 guest token 已删除。重新扫码后会生成新的配对链路。');
    });

    renderSessions();
    renderDetailMeta();
    renderMessages();
    updateComposerState();
    boot().catch((error) => {
      cleanupBridge();
      setStatus('连接失败', error instanceof Error ? error.message : String(error));
    });
`
