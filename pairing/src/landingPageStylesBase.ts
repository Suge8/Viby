export const landingPageStylesBase = `
    :root {
      color-scheme: light;
      --bg: #eef4ed;
      --panel: rgba(255, 255, 255, 0.9);
      --ink: #132b21;
      --muted: #567162;
      --accent: #1f7a45;
      --accent-soft: rgba(31, 122, 69, 0.12);
      --stroke: rgba(19, 43, 33, 0.1);
      --shadow: 0 24px 80px rgba(19, 43, 33, 0.12);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: "SF Pro Display", "Segoe UI Variable", "Helvetica Neue", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(31, 122, 69, 0.18), transparent 34%),
        radial-gradient(circle at bottom right, rgba(255, 184, 88, 0.16), transparent 28%),
        linear-gradient(180deg, #f8fbf8 0%, var(--bg) 100%);
      min-height: 100vh;
    }

    main {
      width: min(1180px, calc(100vw - 24px));
      margin: 0 auto;
      padding: 24px 0 40px;
    }

    .shell {
      display: grid;
      gap: 18px;
    }

    .hero,
    .workspace {
      background: var(--panel);
      border: 1px solid var(--stroke);
      border-radius: 28px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .hero {
      padding: 22px;
      overflow: hidden;
      position: relative;
    }

    .hero::after {
      content: "";
      position: absolute;
      inset: auto -80px -120px auto;
      width: 240px;
      height: 240px;
      background: radial-gradient(circle, rgba(31, 122, 69, 0.2), transparent 68%);
      pointer-events: none;
    }

    .eyebrow {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
    }

    h1 {
      margin: 10px 0 10px;
      font-size: clamp(32px, 6vw, 52px);
      line-height: 0.98;
      letter-spacing: -0.05em;
    }

    .summary {
      max-width: 760px;
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
      font-size: 15px;
    }

    .hero-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: 1.4fr 0.9fr;
      align-items: end;
      margin-top: 18px;
    }

    .status-card,
    .meta-card,
    .sessions-panel,
    .detail-panel {
      border: 1px solid var(--stroke);
      border-radius: 22px;
      background: rgba(255, 255, 255, 0.74);
    }

    .status-card,
    .meta-card {
      padding: 18px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: currentColor;
      box-shadow: 0 0 0 6px rgba(31, 122, 69, 0.09);
    }

    .status-copy {
      margin-top: 14px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
      font-size: 14px;
    }

    .meta-grid {
      display: grid;
      gap: 12px;
    }

    .meta-row span {
      display: block;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 6px;
    }

    .meta-row strong {
      display: block;
      font-size: 15px;
      line-height: 1.45;
      word-break: break-word;
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
    }

    button {
      appearance: none;
      border: 0;
      border-radius: 999px;
      padding: 12px 16px;
      font: inherit;
      cursor: pointer;
      background: var(--ink);
      color: white;
      transition: transform 120ms ease, opacity 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

    button.secondary {
      background: white;
      color: var(--ink);
      border: 1px solid var(--stroke);
    }
`
