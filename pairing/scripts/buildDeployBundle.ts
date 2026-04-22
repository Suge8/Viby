import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pairingRoot = dirname(scriptDir)
const repoRoot = dirname(pairingRoot)
const bundleDir = join(pairingRoot, 'deploy-bundle')
const archivePath = join(pairingRoot, 'deploy-bundle.tar.gz')
const archiveChecksumPath = join(pairingRoot, 'deploy-bundle.sha256')
const defaultInstallDir = '/opt/viby-pairing'

function assertFileExists(path: string, message: string): void {
    if (!existsSync(path)) {
        throw new Error(message)
    }
}

function ensureBundleDir(): void {
    rmSync(bundleDir, { force: true, recursive: true })
    mkdirSync(bundleDir, { recursive: true })
}

function copyBundleFile(fromPath: string, toName: string): void {
    copyFileSync(fromPath, join(bundleDir, toName))
}

function writeBundleFile(name: string, content: string, mode?: number): void {
    const targetPath = join(bundleDir, name)
    writeFileSync(targetPath, content)
    if (typeof mode === 'number') {
        chmodSync(targetPath, mode)
    }
}

function buildRunScript(): string {
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

function buildServiceTemplate(): string {
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
StandardOutput=append:${defaultInstallDir}/logs/pairing.log
StandardError=append:${defaultInstallDir}/logs/pairing.error.log

[Install]
WantedBy=multi-user.target
`
}

function buildDeployReadme(indexSizeBytes: number): string {
    return `# Viby Pairing Deploy Bundle

这个目录就是公网 pairing broker 的最小上传面。

## 里面每个文件是什么

- \`index.js\`：pairing broker 的打包运行产物
- \`pairing.env.example\`：环境变量模板，复制成 \`pairing.env\` 后填写真实值
- \`run-pairing.sh\`：启动脚本，会自动读取同目录的 \`pairing.env\`
- \`viby-pairing.service\`：systemd 模板，默认安装目录是 \`${defaultInstallDir}\`
- \`Caddyfile.pairing\`：Caddy 反向代理示例
- \`coturn.conf.example\`：TURN 配置示例

bundle 目录生成后，旁边还会附带：

- \`../deploy-bundle.tar.gz\`：可直接上传的压缩包
- \`../deploy-bundle.sha256\`：压缩包校验和

## 上传到服务器后怎么放

推荐直接放到：

\`\`\`text
${defaultInstallDir}
\`\`\`

目录结构建议：

\`\`\`text
${defaultInstallDir}/
  index.js
  pairing.env
  pairing.env.example
  run-pairing.sh
  viby-pairing.service
  Caddyfile.pairing
  coturn.conf.example
  logs/
\`\`\`

## 第 1 步：安装系统依赖

服务器最少需要：

- Bun
- Redis
- coturn
- Caddy 或 Nginx

注意：

- broker 只是配对 / signaling / TURN 凭证控制面
- Redis 存临时 pairing state
- coturn 是 WebRTC 稳定性兜底，不建议省略

## 第 2 步：编辑 pairing.env

\`\`\`bash
cp pairing.env.example pairing.env
\`\`\`

然后至少填写这些：

\`\`\`env
PAIRING_PUBLIC_URL=https://pair.example.com
PAIRING_REDIS_URL=redis://127.0.0.1:6379
PAIRING_CREATE_TOKEN=replace-with-strong-secret
PAIRING_STUN_URLS=stun:stun.l.google.com:19302
PAIRING_TURN_URLS=turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp
PAIRING_TURN_SECRET=replace-with-turn-secret
PAIRING_TURN_REALM=turn.example.com
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

## 第 5 步：安装反向代理

把 \`Caddyfile.pairing\` 里的域名改成你的真实域名。

## 第 6 步：配置 coturn

把 \`coturn.conf.example\` 里的：

- \`static-auth-secret\`
- \`realm\`

改成和 \`pairing.env\` 里的：

- \`PAIRING_TURN_SECRET\`
- \`PAIRING_TURN_REALM\`

完全一致。

## 最佳实践

- 不要把真实 \`pairing.env\` 提交回仓库
- 服务器上的 \`pairing.env\` 权限建议设为 \`600\`
- 不要只配 STUN，不配 TURN
- Redis 建议走内网地址
- 反代必须启用 HTTPS / WSS

## 当前 bundle 信息

- 产物文件：\`index.js\`
- 产物大小：${(indexSizeBytes / 1024 / 1024).toFixed(2)} MiB
`
}

function writeBundleArchive(): void {
    rmSync(archivePath, { force: true })
    rmSync(archiveChecksumPath, { force: true })
    execFileSync('tar', ['-czf', archivePath, '-C', pairingRoot, 'deploy-bundle'])
    const checksum = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
    writeFileSync(archiveChecksumPath, `${checksum}  deploy-bundle.tar.gz\n`)
}

function main(): void {
    const distFile = join(pairingRoot, 'dist', 'index.js')
    const envExampleFile = join(pairingRoot, '.env.example')
    const caddyFile = join(repoRoot, 'docs', 'examples', 'Caddyfile.pairing')
    const coturnFile = join(repoRoot, 'docs', 'examples', 'coturn.conf.example')

    assertFileExists(distFile, 'Missing pairing/dist/index.js. Run `bun run --cwd pairing build` first.')
    assertFileExists(envExampleFile, 'Missing pairing/.env.example')
    assertFileExists(caddyFile, 'Missing docs/examples/Caddyfile.pairing')
    assertFileExists(coturnFile, 'Missing docs/examples/coturn.conf.example')

    ensureBundleDir()
    copyBundleFile(distFile, 'index.js')
    copyBundleFile(envExampleFile, 'pairing.env.example')
    copyBundleFile(caddyFile, 'Caddyfile.pairing')
    copyBundleFile(coturnFile, 'coturn.conf.example')
    writeBundleFile('run-pairing.sh', buildRunScript(), 0o755)
    writeBundleFile('viby-pairing.service', buildServiceTemplate())
    writeBundleFile('DEPLOY.md', buildDeployReadme(readFileSync(distFile).byteLength))
    writeBundleArchive()
}

main()
