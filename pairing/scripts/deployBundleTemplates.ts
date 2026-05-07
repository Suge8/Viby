export const defaultInstallDir = '/opt/viby-pairing'

export function buildRunScript(): string {
    return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/pairing.env"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but was not found in PATH" >&2
  exit 1
fi

if [[ -f "$ENV_FILE" ]]; then
  exec bun --env-file="$ENV_FILE" --no-env-file "$SCRIPT_DIR/index.js"
fi

exec bun --no-env-file "$SCRIPT_DIR/index.js"
`
}

export function buildServiceTemplate(): string {
    return `[Unit]
Description=Viby Pairing Broker
After=network.target redis.service
Wants=redis.service

[Service]
Type=simple
WorkingDirectory=${defaultInstallDir}
ExecStart=${defaultInstallDir}/run-pairing.sh
Restart=always
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=read-only
ProtectClock=true
ProtectControlGroups=true
ProtectKernelLogs=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictSUIDSGID=true
RestrictRealtime=true
LockPersonality=true
SystemCallArchitectures=native
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
CapabilityBoundingSet=
AmbientCapabilities=
ReadWritePaths=${defaultInstallDir}/logs
StandardOutput=append:${defaultInstallDir}/logs/pairing.log
StandardError=append:${defaultInstallDir}/logs/pairing.error.log

[Install]
WantedBy=multi-user.target
`
}

export function buildLogrotateConfig(): string {
    return `${defaultInstallDir}/logs/pairing.log ${defaultInstallDir}/logs/pairing.error.log {
  daily
  rotate 14
  maxsize 10M
  missingok
  notifempty
  compress
  delaycompress
  copytruncate
  create 0600 root root
}
`
}

export function buildHealthCheckScript(): string {
    return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/pairing.env"
checks=()

fail() {
  echo "viby-pairing health check failed: $1" >&2
  exit 1
}

if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

command -v curl >/dev/null 2>&1 || fail "curl is required"

local_host="\${PAIRING_HOST:-127.0.0.1}"
if [[ "$local_host" == "0.0.0.0" || "$local_host" == "::" ]]; then
  local_host="127.0.0.1"
fi
local_port="\${PAIRING_PORT:-8787}"
local_base="http://$local_host:$local_port"

curl -fsS --max-time 3 "$local_base/ready" >/dev/null || fail "local readiness endpoint is unavailable"
checks+=(local-ready)

if [[ -n "\${PAIRING_PUBLIC_URL:-}" ]]; then
  public_base="\${PAIRING_PUBLIC_URL%/}"
  curl -fsS --max-time 5 "$public_base/ready" >/dev/null || fail "public readiness endpoint is unavailable"
  checks+=(public-ready)
fi

if [[ -n "\${PAIRING_CREATE_TOKEN:-}" ]]; then
  curl -fsS --max-time 3 -H "authorization: Bearer $PAIRING_CREATE_TOKEN" "$local_base/metrics" \
    | grep -q '"uptimeMs"' || fail "metrics endpoint is unavailable"
  checks+=(metrics)
fi

run_turn_smoke() {
  local url="$1"
  local scheme="\${url%%:*}"
  local hostport="\${url#*:}"
  hostport="\${hostport%%\\?*}"
  local host="\${hostport%:*}"
  local port="\${hostport##*:}"
  if [[ "$host" == "$hostport" ]]; then
    port=$([[ "$scheme" == "turns" ]] && echo 5349 || echo 3478)
  fi

  local args=(-W "$PAIRING_TURN_STATIC_AUTH_SECRET" -y -c -n 1 -m 1 -p "$port")
  if [[ "$scheme" == "turns" ]]; then
    args=(-t -S "\${args[@]}")
  elif [[ "$url" == *"transport=tcp"* ]]; then
    args=(-t "\${args[@]}")
  fi

  timeout 20 turnutils_uclient "\${args[@]}" "$host" >/dev/null 2>&1 || fail "TURN smoke failed for $url"
}

if [[ -n "\${PAIRING_TURN_URLS:-}" && -n "\${PAIRING_TURN_STATIC_AUTH_SECRET:-}" ]]; then
  command -v turnutils_uclient >/dev/null 2>&1 || fail "turnutils_uclient is required for TURN smoke"
  IFS=',' read -ra turn_urls <<< "$PAIRING_TURN_URLS"
  for turn_url in "\${turn_urls[@]}"; do
    run_turn_smoke "\${turn_url//[[:space:]]/}"
  done
  checks+=(turn)
fi

printf '{"ok":true,"checks":"%s"}\\n' "\${checks[*]}"
`
}

export function buildDeployReadme(indexSizeBytes: number): string {
    return `# Viby Pairing Deploy Bundle

这个目录就是公网 pairing broker 的最小上传面。

## 里面每个文件是什么

- \`index.js\`：pairing broker 的打包运行产物
- \`web-index.html\`、\`assets/\` 与根静态资源：手机端复用的正常 Viby Web
- \`pairing.env.example\`：环境变量模板，复制成 \`pairing.env\` 后填写真实值
- \`run-pairing.sh\`：启动脚本，会自动读取同目录的 \`pairing.env\`
- \`viby-pairing.service\`：systemd 模板，默认安装目录是 \`${defaultInstallDir}\`
- \`viby-pairing.logrotate\`：日志轮转模板，适配 systemd append 日志
- \`viby-pairing-health-check.sh\`：readiness、metrics 与 TURN smoke 检查
- \`Caddyfile.pairing\`：Caddy 反向代理示例

bundle 目录生成后，旁边还会附带 \`../deploy-bundle.tar.gz\` 和 \`../deploy-bundle.sha256\`。

## 上传到服务器后怎么放

推荐直接放到 \`${defaultInstallDir}\`。

\`\`\`text
${defaultInstallDir}/
  index.js
  web-index.html
  assets/
  brand-logo-tight.png
  pairing.env
  pairing.env.example
  run-pairing.sh
  viby-pairing.service
  viby-pairing.logrotate
  viby-pairing-health-check.sh
  Caddyfile.pairing
  logs/
\`\`\`

## 第 1 步：安装系统依赖

服务器最少需要 Bun、Redis、Caddy 或 Nginx；TURN smoke 需要 coturn 的 \`turnutils_uclient\`。

注意：broker 只是配对 / signaling 控制面，并托管手机端正常 Web 静态资源；Redis 存临时 pairing state；WebRTC ICE 默认直连优先，TURN 只做失败兜底。

## 第 2 步：编辑 pairing.env

\`\`\`bash
cp pairing.env.example pairing.env
\`\`\`

然后至少填写这些：

\`\`\`env
PAIRING_PUBLIC_URL=https://pair.example.com
PAIRING_REDIS_URL=redis://127.0.0.1:6379
PAIRING_CREATE_TOKEN=replace-with-strong-secret
PAIRING_STUN_URLS=stun:turn.example.com:3478
PAIRING_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
PAIRING_TURN_STATIC_AUTH_SECRET=replace-with-coturn-static-auth-secret
PAIRING_TURN_CREDENTIAL_TTL_SECONDS=600
\`\`\`

生产建议再加：

\`\`\`env
PAIRING_CREATE_LIMIT_PER_MINUTE=30
PAIRING_CLAIM_LIMIT_PER_MINUTE=20
PAIRING_RECONNECT_LIMIT_PER_MINUTE=60
PAIRING_APPROVE_LIMIT_PER_MINUTE=30
\`\`\`

## 第 3 步：手工启动验证

\`\`\`bash
mkdir -p logs
./run-pairing.sh
\`\`\`

健康检查：

\`\`\`bash
curl -s http://127.0.0.1:8787/health
\`\`\`

## 第 4 步：安装 systemd

\`\`\`bash
sudo cp viby-pairing.service /etc/systemd/system/viby-pairing.service
sudo systemctl daemon-reload
sudo systemctl enable --now viby-pairing
sudo systemctl status viby-pairing
\`\`\`

## 第 5 步：安装运维辅助

\`\`\`bash
sudo cp viby-pairing.logrotate /etc/logrotate.d/viby-pairing
sudo logrotate -d /etc/logrotate.d/viby-pairing
./viby-pairing-health-check.sh
\`\`\`

## 第 6 步：安装反向代理

把 \`Caddyfile.pairing\` 里的域名改成你的真实域名。

## 最佳实践

- 不要把真实 \`pairing.env\` 提交回仓库
- 服务器上的 \`pairing.env\` 权限建议设为 \`600\`
- systemd 服务默认启用最小沙箱：只允许写 \`logs/\`，其余安装目录只读
- 日志轮转使用 \`copytruncate\`，避免重启 broker 才释放旧日志文件
- 保持默认 ICE 策略；不要在客户端强制 relay
- TURN 端口优先开 UDP 3478，再开 TCP 3478 和 TLS 5349 兜底
- 多地区用户就部署多组 TURN，把近端节点排在 \`PAIRING_TURN_URLS\` 前面
- Redis 建议走内网地址
- 反代必须启用 HTTPS / WSS

## 当前 bundle 信息

- 产物文件：\`index.js\`
- 产物大小：${(indexSizeBytes / 1024 / 1024).toFixed(2)} MiB
`
}
