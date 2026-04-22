export const landingPageStylesSurface = `
    .workspace {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 0;
      min-height: 68vh;
      overflow: hidden;
    }

    .sessions-panel {
      border: 0;
      border-right: 1px solid var(--stroke);
      border-radius: 0;
      padding: 18px;
      background: rgba(245, 249, 245, 0.94);
    }

    .detail-panel {
      border: 0;
      border-radius: 0;
      padding: 18px;
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      gap: 14px;
      background: rgba(255, 255, 255, 0.84);
      min-height: 0;
    }

    .panel-title {
      margin: 0 0 4px;
      font-size: 18px;
      letter-spacing: -0.03em;
    }

    .panel-subtitle {
      margin: 0;
      color: var(--muted);
      line-height: 1.5;
      font-size: 13px;
    }

    .session-list {
      display: grid;
      gap: 10px;
      margin-top: 16px;
      max-height: 54vh;
      overflow: auto;
      padding-right: 4px;
    }

    .session-item {
      width: 100%;
      text-align: left;
      border-radius: 18px;
      padding: 14px;
      background: white;
      color: var(--ink);
      border: 1px solid transparent;
      box-shadow: 0 10px 28px rgba(19, 43, 33, 0.06);
    }

    .session-item.is-active {
      border-color: rgba(31, 122, 69, 0.32);
      background: linear-gradient(180deg, rgba(31, 122, 69, 0.08), rgba(255, 255, 255, 0.96));
    }

    .session-item-header {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: start;
    }

    .session-item h3 {
      margin: 0;
      font-size: 15px;
      line-height: 1.35;
    }

    .session-chip {
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }

    .session-meta {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    .detail-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
    }

    .detail-header h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.05;
      letter-spacing: -0.04em;
    }

    .detail-header p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }

    .detail-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .detail-meta {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .detail-meta-card {
      padding: 14px;
      border-radius: 18px;
      background: rgba(19, 43, 33, 0.035);
      border: 1px solid rgba(19, 43, 33, 0.05);
    }

    .detail-meta-card span {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--muted);
      margin-bottom: 8px;
    }

    .detail-meta-card strong {
      display: block;
      font-size: 14px;
      line-height: 1.45;
      word-break: break-word;
    }

    .message-list {
      min-height: 0;
      overflow: auto;
      display: grid;
      gap: 12px;
      padding-right: 4px;
    }

    .message {
      padding: 14px;
      border-radius: 18px;
      background: white;
      border: 1px solid rgba(19, 43, 33, 0.06);
      box-shadow: 0 14px 34px rgba(19, 43, 33, 0.06);
    }

    .message.role-user {
      background: linear-gradient(180deg, rgba(19, 43, 33, 0.08), rgba(255, 255, 255, 0.98));
    }

    .message-role {
      display: inline-flex;
      margin-bottom: 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--accent);
    }

    .message-body {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.65;
      font-size: 14px;
    }

    .stream-box {
      padding: 14px;
      border-radius: 18px;
      background: rgba(31, 122, 69, 0.07);
      border: 1px dashed rgba(31, 122, 69, 0.22);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.65;
      font-size: 14px;
      color: var(--accent);
    }

    .composer {
      display: grid;
      gap: 10px;
    }

    textarea {
      width: 100%;
      min-height: 110px;
      resize: vertical;
      border-radius: 20px;
      border: 1px solid var(--stroke);
      padding: 14px 16px;
      font: inherit;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.98);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
    }

    .empty {
      padding: 18px;
      border-radius: 18px;
      background: rgba(19, 43, 33, 0.035);
      border: 1px dashed rgba(19, 43, 33, 0.12);
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }

    @media (max-width: 920px) {
      .hero-grid,
      .workspace {
        grid-template-columns: 1fr;
      }

      .sessions-panel {
        border-right: 0;
        border-bottom: 1px solid var(--stroke);
      }

      main {
        width: min(100vw - 16px, 100%);
      }

      .hero,
      .workspace {
        border-radius: 22px;
      }
    }
`
