import {
    buildHubAccessEntries,
    buildHubPairingHint,
    type HubAccessEntry,
    type HubAccessScope,
} from '@viby/protocol/hubAccessEntries'
import type { HubRuntimeStatus } from '@viby/protocol/runtimeStatus'
import chalk from 'chalk'
import QRCode from 'qrcode'

const SCOPE_LABEL: Record<HubAccessScope, string> = {
    public: '公网',
    lan: '局域网',
    local: '本机',
}

const LABEL_WIDTH = 6
const QR_INDENT = '    '

function indentLines(value: string, prefix: string): string {
    return value
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => `${prefix}${line}`)
        .join('\n')
}

async function renderTerminalQrCode(value: string): Promise<string | null> {
    try {
        return await QRCode.toString(value, { type: 'terminal', small: true })
    } catch {
        return null
    }
}

function shouldRenderQrCode(scope: HubAccessScope): boolean {
    if (!process.stdout.isTTY) return false
    return scope !== 'local'
}

function formatEntry(entry: HubAccessEntry): string {
    const label = chalk.bold(SCOPE_LABEL[entry.scope].padEnd(LABEL_WIDTH))
    return `  ${label} ${chalk.cyan(entry.url)}`
}

function formatPublicHint(status: HubRuntimeStatus): string | null {
    const hint = buildHubPairingHint(status)
    if (hint) {
        const label = chalk.bold(SCOPE_LABEL.public.padEnd(LABEL_WIDTH))
        return `  ${label} ${chalk.cyan(hint.brokerHost)} ${chalk.dim('— 在 Web/Desktop 用配对按钮生成二维码')}`
    }
    if (!status.publicAccessEnabled) {
        const label = chalk.bold(SCOPE_LABEL.public.padEnd(LABEL_WIDTH))
        return `  ${label} ${chalk.gray('已关闭')} ${chalk.dim('— 加 --public 启用')}`
    }
    return null
}

function summariseFlags(status: HubRuntimeStatus): string {
    const hostMode =
        status.listenHost === '127.0.0.1' ? '本机' : status.listenHost === '0.0.0.0' ? '局域网' : status.listenHost
    const publicMode = status.publicAccessEnabled ? '开启' : '关闭'
    return chalk.dim(`  bind=${hostMode}(${status.listenHost}:${status.listenPort})  public=${publicMode}`)
}

export async function printCliAccessSummary(status: HubRuntimeStatus): Promise<void> {
    const entries = buildHubAccessEntries(status)
    const hasDirectPublic = entries.some((entry) => entry.scope === 'public')
    const publicHint = hasDirectPublic ? null : formatPublicHint(status)

    console.log('')
    console.log(chalk.bold('Viby Hub 连接入口'))
    console.log(summariseFlags(status))
    console.log('')

    for (const entry of entries) {
        console.log(formatEntry(entry))
        if (shouldRenderQrCode(entry.scope)) {
            const qr = await renderTerminalQrCode(entry.url)
            if (qr) {
                console.log(indentLines(qr, QR_INDENT))
            }
        }
    }

    if (publicHint) {
        console.log(publicHint)
    }

    console.log('')
    console.log(chalk.dim('  按 Ctrl-C 停止'))
    console.log('')
}
