import { landingPageClientSupportScript } from './landingPageScriptClientSupport'
import { landingPageDeviceSupportScript } from './landingPageScriptDeviceSupport'
import { landingPageStatusScript } from './landingPageScriptStatus'
export function renderLandingPageUiScript(pairingId: string): string {
    return `
    const pairingId = ${JSON.stringify(pairingId)};
    const tokenKey = 'viby:pairing:' + pairingId + ':guest-token';
    const state = {
      bridge: null,
      pairing: null,
      sessions: [],
      currentSessionId: null,
      currentView: null,
      messages: [],
      stream: null,
      refreshSessionsTimer: null,
      refreshCurrentTimer: null,
      requestSeq: 0,
      pending: new Map()
    };

    const statusEl = document.getElementById('status');
    const badgeEl = document.getElementById('bridgeBadge');
    const deviceTokenStateEl = document.getElementById('deviceTokenState');
    const currentSessionLabelEl = document.getElementById('currentSessionLabel');
    const approvalStateEl = document.getElementById('approvalState');
    const shortCodeEl = document.getElementById('shortCode');
    const sessionListEl = document.getElementById('sessionList');
    const detailTitleEl = document.getElementById('detailTitle');
    const detailSubtitleEl = document.getElementById('detailSubtitle');
    const detailMetaEl = document.getElementById('detailMeta');
    const messageListEl = document.getElementById('messageList');
    const composerEl = document.getElementById('composer');
    const sendButton = document.getElementById('sendMessage');
    const resumeButton = document.getElementById('resumeSession');
    const retryButton = document.getElementById('retry');
    const reloadSessionsButton = document.getElementById('reloadSessions');
    const resetButton = document.getElementById('reset');

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

${landingPageStatusScript}
${landingPageDeviceSupportScript}

    function describeError(error) {
      return error instanceof Error ? error.message : String(error);
    }

    function runTask(task, badge) {
      task().catch((error) => {
        setStatus(badge, describeError(error));
      });
    }

    function clearTimers() {
      if (state.refreshSessionsTimer) {
        clearTimeout(state.refreshSessionsTimer);
        state.refreshSessionsTimer = null;
      }
      if (state.refreshCurrentTimer) {
        clearTimeout(state.refreshCurrentTimer);
        state.refreshCurrentTimer = null;
      }
    }

    function scheduleRefreshSessions() {
      if (!state.refreshSessionsTimer) {
        state.refreshSessionsTimer = setTimeout(() => {
          state.refreshSessionsTimer = null;
          runTask(() => refreshSessions(), '会话刷新失败');
        }, 180);
      }
    }

    function scheduleRefreshCurrent() {
      if (state.currentSessionId && !state.refreshCurrentTimer) {
        state.refreshCurrentTimer = setTimeout(() => {
          state.refreshCurrentTimer = null;
          runTask(() => refreshCurrentSession(), '会话同步失败');
        }, 160);
      }
    }

${landingPageClientSupportScript}

    renderPairingMeta();
`
}
