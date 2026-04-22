export const landingPageStatusScript = `
    function setStatus(badge, message) {
      badgeEl.textContent = badge;
      statusEl.textContent = message;
    }

    function getPairingStatus(pairing) {
      if (!pairing || !pairing.pairing) {
        return { approval: '等待扫码', code: '待生成', badge: '准备建立链路', message: '正在初始化配对…' };
      }

      const snapshot = pairing.pairing;
      if (!snapshot.guest) {
        return {
          approval: '等待扫码',
          code: snapshot.shortCode || '待生成',
          badge: '等待手机接入',
          message: '等待手机扫码接入。'
        };
      }

      if (snapshot.approvalStatus === 'pending') {
        return {
          approval: '待桌面确认',
          code: snapshot.shortCode || '待生成',
          badge: '等待桌面批准',
          message: snapshot.shortCode
            ? '请在桌面端核对确认码 ' + snapshot.shortCode + '，批准后才会建立点对点链路。'
            : '手机已扫码，等待桌面端批准接入。'
        };
      }

      if (snapshot.approvalStatus === 'approved') {
        return {
          approval: '已批准',
          code: snapshot.shortCode || '已核对',
          badge: state.bridge && state.bridge.connected ? '手机已接入' : '建立点对点链路',
          message: state.bridge && state.bridge.connected
            ? '点对点控制链路已建立。现在可以直接浏览电脑上的会话并继续发送消息。'
            : '桌面已批准接入，正在建立点对点控制链路…'
        };
      }

      return { approval: '等待扫码', code: '待生成', badge: '准备建立链路', message: '正在初始化配对…' };
    }

    function renderPairingMeta() {
      const pairingStatus = getPairingStatus(state.pairing);
      approvalStateEl.textContent = pairingStatus.approval;
      shortCodeEl.textContent = pairingStatus.code;
    }
`
