import {
    DEFAULT_VIBY_LISTEN_HOST,
    DEFAULT_VIBY_LISTEN_PORT,
    DEFAULT_VIBY_LOCAL_API_URL
} from './runtimeDefaults'

type BunTomlParser = {
    parse(raw: string): unknown
}

export type VibyLocalSettings = {
    cliApiToken?: string
    apiUrl?: string
    listenHost?: string
    listenPort?: number
    publicUrl?: string
    corsOrigins?: string[]
    machineId?: string
    machineIdConfirmedByServer?: boolean
    vapidKeys?: {
        publicKey: string
        privateKey: string
    }
}

function getTomlParser(): BunTomlParser {
    const bunValue = (globalThis as { Bun?: { TOML?: BunTomlParser } }).Bun
    const parser = bunValue?.TOML
    if (!parser) {
        return {
            parse: parseTomlFallback
        }
    }
    return parser
}

function parseTomlValue(raw: string): unknown {
    if (raw === 'true') {
        return true
    }
    if (raw === 'false') {
        return false
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        return Number(raw)
    }
    if (
        (raw.startsWith('"') && raw.endsWith('"'))
        || (raw.startsWith('[') && raw.endsWith(']'))
    ) {
        try {
            return JSON.parse(raw)
        } catch {
            return raw
        }
    }
    return raw
}

function parseTomlFallback(raw: string): Record<string, unknown> {
    const root: Record<string, unknown> = {}
    let current = root

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) {
            continue
        }

        const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/)
        if (sectionMatch) {
            const sectionName = sectionMatch[1]?.trim()
            if (!sectionName) {
                current = root
                continue
            }
            const section = asRecord(root[sectionName])
            root[sectionName] = section
            current = section
            continue
        }

        const separatorIndex = trimmed.indexOf('=')
        if (separatorIndex < 0) {
            continue
        }

        const key = trimmed.slice(0, separatorIndex).trim()
        if (!key) {
            continue
        }

        const value = trimmed.slice(separatorIndex + 1).trim()
        current[key] = parseTomlValue(value)
    }

    return root
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    }
    return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
    const value = record[key]
    return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
    const value = record[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
    const value = record[key]
    return typeof value === 'boolean' ? value : undefined
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
    const value = record[key]
    if (!Array.isArray(value)) {
        return undefined
    }

    const entries = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    return entries.length > 0 ? entries : []
}

function formatTomlString(value: string): string {
    return JSON.stringify(value)
}

function formatTomlStringArray(values: string[]): string {
    return `[${values.map((value) => formatTomlString(value)).join(', ')}]`
}

export function parseVibyLocalSettingsToml(raw: string): VibyLocalSettings {
    const parser = getTomlParser()
    const parsed = asRecord(parser.parse(raw))
    const system = asRecord(parsed.system)
    const push = asRecord(parsed.push)
    const pushPublicKey = readString(push, 'public_key')
    const pushPrivateKey = readString(push, 'private_key')

    return {
        cliApiToken: readString(parsed, 'cli_api_token'),
        apiUrl: readString(parsed, 'api_url'),
        listenHost: readString(parsed, 'listen_host'),
        listenPort: readNumber(parsed, 'listen_port'),
        publicUrl: readString(parsed, 'public_url'),
        corsOrigins: readStringArray(parsed, 'cors_origins'),
        machineId: readString(system, 'machine_id'),
        machineIdConfirmedByServer: readBoolean(system, 'machine_id_confirmed_by_server'),
        vapidKeys: pushPublicKey && pushPrivateKey
            ? {
                publicKey: pushPublicKey,
                privateKey: pushPrivateKey
            }
            : undefined
    }
}

export function stringifyVibyLocalSettingsToml(settings: VibyLocalSettings): string {
    const lines: string[] = [
        '# ================================================',
        '# 🌏 Viby Settings / 用户配置',
        '# Edit the fields below when you need to. / 需要时只改下面这些。',
        '# ================================================',
        ''
    ]

    lines.push('# 🔑 Shared login token / 登录令牌')
    lines.push(`cli_api_token = ${formatTomlString(settings.cliApiToken ?? '')}`)
    lines.push('')

    lines.push('# 🌐 CLI -> Hub API URL / CLI 连接 Hub 地址')
    lines.push(`api_url = ${formatTomlString(settings.apiUrl ?? DEFAULT_VIBY_LOCAL_API_URL)}`)
    lines.push('')

    lines.push('# 🧭 Hub listen host / Hub 监听地址')
    lines.push(`listen_host = ${formatTomlString(settings.listenHost ?? DEFAULT_VIBY_LISTEN_HOST)}`)
    lines.push('# 🔌 Hub listen port / Hub 监听端口')
    lines.push(`listen_port = ${settings.listenPort ?? DEFAULT_VIBY_LISTEN_PORT}`)
    lines.push('# 🚀 Public URL / 对外访问地址')
    lines.push(`public_url = ${formatTomlString(settings.publicUrl ?? '')}`)
    lines.push('# 🪪 Allowed CORS origins / 允许的来源')
    lines.push(`cors_origins = ${formatTomlStringArray(settings.corsOrigins ?? [])}`)

    lines.push(
        '',
        '# ------------------------------------------------',
        '# 🤖 System Info / 系统信息',
        '# Auto-generated. Usually do not edit. / 自动生成，通常不要手改。',
        '# ------------------------------------------------',
        ''
    )

    lines.push('[system]')
    lines.push(`machine_id = ${formatTomlString(settings.machineId ?? '')}`)
    lines.push(`machine_id_confirmed_by_server = ${settings.machineIdConfirmedByServer ? 'true' : 'false'}`)

    lines.push('', '[push]')
    lines.push(`public_key = ${formatTomlString(settings.vapidKeys?.publicKey ?? '')}`)
    lines.push(`private_key = ${formatTomlString(settings.vapidKeys?.privateKey ?? '')}`)

    return `${lines.join('\n').trim()}\n`
}
