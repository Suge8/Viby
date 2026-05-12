# Docs

这里放 Viby 的开发文档和架构说明。

README 只保留产品入口；复杂边界和运行约束统一收口到这里。

## 架构

这些文档已经同步到当前稳定主路径，包括：Hub session activity 物化、Web transcript `flat row + react-virtuoso` scroll owner、markdown 轻路径与 syntax runtime 核心语言策略。

- `docs/architecture/system-overview.md`：模块边界与单一事实源
- `docs/architecture/realtime-recovery.md`：realtime、reconnect、catch-up 和 streaming 语义
- `docs/architecture/cross-device-resume-architecture.md`：跨端恢复、History/Hub resume 与本地 orphan recovery 分工、Hub/CLI 单一控制方案
- `docs/architecture/driver-resume-semantics.md`：7 个 driver 的 resume 语义、互通边界与 Viby continuity 结论
- `docs/architecture/command-capability-convergence.md`：`/` 命令、native skills、Viby `$skill` 与会话类命令接管收口蓝图
- `docs/architecture/web-browser-storage-architecture.md`：Web 浏览器存储四层分层、AppCacheDB owner、legacy cache 迁移与长期边界
- `docs/architecture/hub-web-connection-rendering-convergence.md`：Hub/Web 连接、恢复、显示、渲染主路径收口蓝图
- `docs/architecture/web-entry-session-switch-convergence.md`：Web/PWA 进入、长后台返回、会话切换、boot shell 与 loading surface 收口审计
- `docs/architecture/transcript-viewport-extreme-convergence.md`：transcript viewport、side rail、width drift 与极简渲染主路径收口蓝图
- `docs/architecture/react-virtuoso-chat-scroll-migration.md`：Web chat transcript 迁移到 `react-virtuoso` 的重构设计、目标架构、删除路径与验证矩阵
- `docs/architecture/pairing-broker.md`：扫码配对、remote DataChannel、broker 与 ICE 方案
- `docs/architecture/pairing-presence.md`：设备 active 单一事实源、scan 在线由 desktop bridge map 判定、revoke 硬删与 v20 数据迁移
- `docs/architecture/unified-pairing-auth.md`：配对码统一认证、设备绑定、访问密钥退出产品主路径设计

## 开发边界

- `docs/development/repo-boundaries.md`：仓库级硬规则与模块边界入口
- `docs/development/web-boundaries.md`：Web/PWA 开发边界
- `docs/development/web-native-feel.md`：Web 原生质感视觉 owner 与验证边界
- `docs/development/pwa-install.md`：PWA 安装来源、平台提示矩阵与 owner
- `docs/development/desktop-ui-shell.md`：Desktop 入口 UI 壳层、交互主路径与视觉 owner
- `docs/development/hub-owners.md`：Hub owner 与 durable mutation 边界
- `docs/development/cli-runtime-boundaries.md`：CLI runtime、runner、resume token 边界
- `docs/development/shared-contracts.md`：shared 合同层与 schema owner 边界
- `docs/development/documentation-authoring.md`：README / AGENTS / docs 分层与写法标准
- `docs/development/pairing-deployment.md`：pairing broker 部署、Hub 接入与当前操作方式
- `docs/development/history-session-regression-audit.md`：历史会话白屏/失去交互事故审计

## 部署与操作

- `docs/deployment/pairing-broker.md`：公网 pairing broker 生产部署手册
- `docs/deployment/release-distribution.md`：CLI / Desktop 发布与更新 owner、GitHub Release updater 要求
- `docs/operations/pairing-mode.md`：`viby hub` 接入服务端配对模式的操作手册
- `docs/examples/`：systemd / Caddy / compose 示例

### Pairing 最小部署入口

- 默认构建命令：`bun run build:pairing`
- 产物目录：`pairing/deploy-bundle/`
- 打包发布物：`pairing/deploy-bundle.tar.gz`、`pairing/deploy-bundle.sha256`
- bundle 内说明：`pairing/deploy-bundle/DEPLOY.md`

## 内部 Harness

- `docs/internal/update.md`：本地内部 upstream 审计账本与审计游标（local-only / gitignored）
- `docs/internal/harness-constitution.md`：本地内部 Harness 宪法
- `docs/internal/harness-activity-path.md`：本地内部 agent 活动路径
- `docs/internal/browser-observability.md`：浏览器自动化证据链
- `docs/internal/implementation-readiness-baseline.md`：真实开发前的默认实施入口、验证链与 scope 扩张规则
- `docs/internal/quality-score.md`：模块质量基线
- `docs/internal/tech-debt-tracker.md`：技术债账本
- `docs/internal/tech-debt-archive.md`：已完成技术债归档
- `docs/internal/harness-standards.md`：可机械执行的工程标准
- `docs/internal/harness-rollout-playbook.md`：模块推广打法

## 说明

- 历史 RFC 已移除；新的架构提案直接收口到 `docs/architecture/`
