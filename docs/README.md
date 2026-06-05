# Docs

这里放 Viby 的开发文档和架构说明。

README 只保留产品入口；复杂边界和运行约束统一收口到这里。

## 架构

这些文档描述当前稳定主路径的单一事实源；UI 层的逐行 owner 规则看 `docs/development/web-boundaries.md` 与 `docs/development/hub-owners.md`。

- `docs/architecture/system-overview.md`：模块边界与单一事实源
- `docs/architecture/realtime-recovery.md`：realtime、reconnect、catch-up 和 streaming 语义
- `docs/architecture/cross-device-resume-architecture.md`：跨端恢复、History/Hub resume 与本地 orphan recovery 分工、Hub/AppCore 单一控制方案
- `docs/architecture/driver-resume-semantics.md`：7 个 driver 的 resume 语义、互通边界与 Viby continuity 结论
- `docs/architecture/command-capability-convergence.md`：`/` 命令、native skill capability、`$` 过滤模式与会话类命令的能力分层
- `docs/architecture/web-browser-storage-architecture.md`：Web 浏览器存储四层分层、AppCacheDB owner 与长期边界
- `docs/architecture/pairing-broker.md`：扫码配对、remote DataChannel、broker 与 ICE 方案
- `docs/architecture/pairing-integration-tests.md`：pairing 秒级集成测试、默认验证归属与高保真 smoke 分层
- `docs/architecture/pairing-presence.md`：设备 active 单一事实源、scan 在线由 desktop bridge map 判定、revoke 硬删语义
- `docs/architecture/pairing-reconnection.md`：Perfect Negotiation、长寿命 PeerConnection、短寿命 signaling socket 与 ICE restart 恢复链
- `docs/architecture/unified-pairing-auth.md`：配对码统一认证、设备绑定、内部 owner secret 退出产品主路径设计

## 开发边界

- `docs/development/local-development.md`：本地开发主入口、源码生效边界与命令分层
- `docs/development/dev-output.md`：`bun run dev` / `dev:desktop` 终端输出、日志文件与诊断分层契约
- `docs/development/repo-boundaries.md`：仓库级硬规则与模块边界入口
- `docs/development/web-boundaries.md`：Web/PWA 开发边界
- `docs/development/web-native-feel.md`：Web 原生质感视觉 owner 与验证边界
- `docs/development/pwa-install.md`：PWA 安装来源、平台提示矩阵与 owner
- `docs/development/agent-config-studio.md`：Agent 配置可视化、真实文件写入与验证 owner
- `docs/development/desktop-ui-shell.md`：Desktop 入口 UI 壳层、交互主路径与视觉 owner
- `docs/development/runtime-environment.md`：运行时环境变量、保留/高级/内部配置分层
- `docs/development/hub-owners.md`：Hub owner 与 durable mutation 边界
- `docs/development/app-core-runtime-boundaries.md`：AppCore runtime、runner、resume token 边界
- `docs/development/shared-contracts.md`：shared 合同层与 schema owner 边界
- `docs/development/documentation-authoring.md`：README / AGENTS / docs 分层与写法标准

## 部署与操作

- `docs/deployment/pairing-broker.md`：公网 pairing broker 生产部署手册
- `docs/deployment/release-distribution.md`：Desktop 发布与更新 owner、GitHub Release updater 要求
- `docs/operations/pairing-mode.md`：Desktop AppCore 接入服务端配对模式的操作手册
- `site/AGENTS.md`：`viby.run` 产品官网部署与设计契约（单一 owner，不漂移到 `docs/`）
- `docs/examples/`：systemd / Caddy / compose 示例

### Pairing 最小部署入口

- 默认构建命令：`bun run build:pairing`
- 产物目录：`pairing/deploy-bundle/`
- 打包发布物：`pairing/deploy-bundle.tar.gz`、`pairing/deploy-bundle.sha256`
- bundle 内说明：`pairing/deploy-bundle/DEPLOY.md`

## 内部验证

- `docs/internal/agent-workflow.md`：本地内部 agent 活动路径、Done 定义、硬失败条件与模块推广顺序
- `docs/internal/verification-standards.md`：可机械执行的 `verify / audit / smoke` 验证标准
- `docs/internal/browser-observability.md`：浏览器自动化证据链
- `docs/internal/tech-debt-tracker.md`：技术债账本
- `docs/internal/update.md`：本地内部 upstream 审计账本与审计游标（local-only / gitignored）

## 说明

- 历史 RFC 已移除；新的架构提案直接收口到 `docs/architecture/`
