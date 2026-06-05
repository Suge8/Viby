# site/ — viby.run 官网

## 边界

- 单一目标：`viby.run` 根域名产品官网。**不是** PWA、不是工作面、不是 pairing 控制面。
- 静态站点：`index.html` 单文件 + `assets/` 静态资源。无构建步骤，无框架，无依赖。
- 渲染策略：内联 CSS + 内联 JS，零外部 JS 文件；字体走 Fontshare + Google Fonts CDN。
- 文案禁词（语义泄露红线）：`hub` `broker` `sidecar` `pairing` `harness` `runtime` `sessions` `SQLite` `CLI` `TUI` `WebRTC` `TURN` `Service Worker`。译成用户语：`你的电脑 / 远程接力 / 加密链路 / 二维码 / 审批 / 离线照常`。
- 不许 em dash（`—`），用 `·` / `，` / 括号替代。
- Brand register（不是 product UI）：设计可以比产品本身更大胆，但禁触发 impeccable `absolute bans`（gradient text / 侧条 border / 全相同 card grid / hero-metric template / glassmorphism）。

## 设计契约

- 色策略：**Committed warm cream**（light）+ **graphite warm dark**（dark）。两套 token 都在 `:root` 内。
- 字体：display 与 body 共用 `General Sans`（避开 reflex-reject 名单），技术微标签用 `JetBrains Mono`。
- 主题：默认跟随系统 `prefers-color-scheme`；显式 `data-theme="light|dark"` 覆盖；`localStorage["viby-theme"]` 持久化；`?theme=dark|light` query 触发（用于截图、分享、嵌入）。
- 动效：`prefers-reduced-motion` 必须全 honor；任何动画不得阻塞主路径（hero parallax 用 `requestAnimationFrame` 节流）。

## 信息架构（fold 顺序）

| # | id | 主题 | 关键素材 |
|---|---|---|---|
| 1 | hero | 价值主张 | iPhone mockup + 真实 chat（写一个登录页 + 待审批） |
| 2 | machine | 同一时刻 | Mac window + 终端 stagger typing + 大数字 tally |
| 3 | why | 三原则 | 代码不出门 / 不计 token / 每步问你 |
| 4 | how (flow) | 4 步骤 | QR 码 / signal bars / commute tiles / return card |
| 5 | glance | 全貌 ≠ 快捷方式 | 3 个 mini iPhone：会话 / 文件 diff / 终端 |
| 6 | agents | 你已经在用的 AI | 4+4 grid，hover 展开 quote |
| 7 | everywhere (surfaces) | 多端 | Web / PWA / Desktop mini mock |
| 8 | compare | 对比 ChatGPT Plus / Cursor Pro | 4 列对比表，Viby 列 coral 高亮 |
| 9 | faq | 用户最担心的 6 件事 | `<details>/<summary>` accordion |
| 10 | closing | 最终 CTA | 巨型 coral accent + 暖色 puck |

## 编辑路径

- 主体内容：`site/index.html`
- 静态资源：`site/assets/`（logo / agent icons / OG image）
- 部署脚本：`site/deploy.sh`
- nginx 站点配置：`site/viby.run.conf`（部署时同步到服务器）

## 部署

- 服务器：`HK-4c8g` (`154.219.99.213`)
- Web 容器：`1Panel-openresty-XrhK`（openresty 1.27 in docker）
- **关键路径**（踩过的坑：宿主机 `/www` 与 1Panel 路径 `/root/1panel/www` 是两个独立目录；docker 只 mount 后者）
  - 宿主机操作目录：`/root/1panel/www/sites/viby.run/{dist,ssl,log}/`
  - nginx conf 目录：`/root/1panel/www/conf.d/viby.run.conf`
  - 容器内对应：`/www/sites/viby.run/`（mount 自宿主机 `/root/1panel/www`）
  - 永远不要写 `/www/...` 的宿主机绝对路径
- TLS：Let's Encrypt webroot challenge，证书覆盖 `viby.run` + `www.viby.run`；deploy.sh 幂等（首次签发，后续 reload）
- www 子域 301 → 裸域

```bash
bun run site:deploy
```

## 验证基线

修改后必须跑：

- 本地预览：`bun run site:dev`（python3 http.server 5050）
- 上线后：`curl -sI https://viby.run | head -1` → `HTTP/2 200`
- 文案抽查：`grep -iE "hub|broker|sidecar|pairing|harness|runtime|sessions|sqlite|cli|tui|webrtc|turn|service worker|—" site/index.html`，确认零内部术语命中（`GitHub` 字面除外）
- Light + Dark 双模式截图比对（chrome `?theme=light` / `?theme=dark`）
- 移动端 viewport 至少 390×844 抽检
- Lighthouse Perf ≥ 95 / A11y ≥ 95（移动 + 桌面）
- `prefers-reduced-motion: reduce` 验证：所有 `.rise` 立即显示、parallax 不触发、typing 动画静止

## 不做的事

- 不引入构建工具（vite/webpack/...）。如果未来要拆组件，先讨论再动。
- 不放产品功能演示真实截图（用 CSS/SVG 重画 UI）。真实截图绑定到产品 UI 改动，维护成本高且会暴露内部命名。
- 不接入 analytics / 第三方 tracker（与"数据不上云"主张冲突）。
- 不在 site 内复用 web/ 的组件代码——两个目录是独立产物，渲染策略不一样。
