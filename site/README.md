# Viby Site

`viby.run` 产品官网。单文件静态站，零依赖，零构建。

## 本地预览

```bash
bun run site:dev          # python3 -m http.server 5050
# 打开 http://localhost:5050
# 强制暗色：http://localhost:5050/?theme=dark
```

## 部署

```bash
bun run site:deploy       # rsync + nginx reload + certbot（幂等）
```

部署目标：服务器 `HK-4c8g`，宿主机 `/root/1panel/www/sites/viby.run/`，openresty docker 容器反代。详见 `site/AGENTS.md`。

## 结构

```
site/
  index.html        # 主页（HTML + 内联 CSS + 极小 JS）
  assets/           # logo / agent icons / OG image
  viby.run.conf     # openresty 站点配置（部署时同步）
  deploy.sh         # 部署脚本（rsync + certbot + nginx reload）
  AGENTS.md         # 工程边界 / 设计契约 / 文案禁词 / 部署路径
  README.md         # 本文件
```

## 工程边界

- 文案禁内部术语（`hub` / `broker` / `pairing` / ...）—— 完整列表见 `AGENTS.md`
- 设计契约：warm cream + dark graphite 双主题，General Sans + JetBrains Mono
- Lighthouse 目标：Perf ≥ 95 / A11y ≥ 95
