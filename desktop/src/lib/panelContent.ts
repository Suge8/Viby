import { formatRelativeTime } from '@/lib/format'
import type { HubViewState } from '@/lib/hubSnapshot'
import type { EntryPreviewModel } from '@/lib/entryMode'
import type { HubRuntimeStatus, HubSnapshot } from '@/types'

export interface FieldModel {
    label: string
    value: string
    actionLabel?: string
    onAction?: () => void
    mono?: boolean
}

export interface StatusCopy {
    title: string
    subtitle: string
    chip: string
    chipTone: 'managed' | 'idle'
}

export interface OwnershipHint {
    title: string
    body: string
}

type CopyValueHandler = (value: string | undefined, emptyMessage: string) => Promise<void>

interface BuildOverviewFieldsOptions {
    entryPreview: EntryPreviewModel
    status: HubRuntimeStatus | undefined
    copyValue: CopyValueHandler
}

interface BuildDetailFieldsOptions {
    snapshot: HubSnapshot | null
    status: HubRuntimeStatus | undefined
    copyValue: CopyValueHandler
}

const ENTRY_PLACEHOLDER = '启动后会在这里给出入口。'
const KEY_PLACEHOLDER = '启动后会在这里给出访问密钥。'
const VALUE_PLACEHOLDER = '未提供'
const EMPTY_ENTRY_MESSAGE = '当前还没有可复制的入口地址。'
const EMPTY_KEY_MESSAGE = '当前还没有访问密钥。'
const EMPTY_PUBLIC_MESSAGE = '当前还没有公网地址。'
const EMPTY_DIRECT_MESSAGE = '当前还没有直达链接。'
const EMPTY_LOG_MESSAGE = '当前还没有日志文件路径。'
const EMPTY_CONFIG_MESSAGE = '当前还没有配置文件路径。'
const OWNERSHIP_HINT_TITLE = '关闭窗口会进入状态栏'
const MANAGED_HINT_BODY = '从 Dock 或状态栏点一下就能把窗口叫回来。'
const STARTING_PRIMARY_ACTION_LABEL = '正在开启'
const MANAGED_PRIMARY_ACTION_LABEL = '停止中枢'
const IDLE_PRIMARY_ACTION_LABEL = '开启中枢'

function compactPreview(value: string | undefined, placeholder: string = VALUE_PLACEHOLDER): string {
    if (!value) {
        return placeholder
    }

    if (value.length <= 44) {
        return value
    }

    return `${value.slice(0, 24)}…${value.slice(-14)}`
}

function compactTokenPreview(value: string | undefined): string {
    if (!value) {
        return KEY_PLACEHOLDER
    }

    if (value.length <= 18) {
        return value
    }

    return `${value.slice(0, 8)}•••${value.slice(-6)}`
}

function buildCopyField(
    label: string,
    value: string | undefined,
    copyValue: CopyValueHandler,
    emptyMessage: string,
    placeholder?: string,
): FieldModel {
    return {
        label,
        value: compactPreview(value, placeholder),
        actionLabel: value ? '复制' : undefined,
        onAction: value ? () => void copyValue(value, emptyMessage) : undefined,
        mono: true
    }
}

export function buildStatusCopy(viewState: HubViewState, canStart: boolean): StatusCopy {
    if (viewState.managed && viewState.ready) {
        return {
            title: '运行中',
            subtitle: '入口已经准备好，关上窗口只会隐藏到状态栏。',
            chip: '本窗口托管',
            chipTone: 'managed'
        }
    }

    if (viewState.managed && viewState.running) {
        return {
            title: '正在启动',
            subtitle: '正在把这台机器接入中枢，入口很快就会出现。',
            chip: '本窗口托管',
            chipTone: 'managed'
        }
    }

    if (!canStart) {
        return {
            title: '暂不可用',
            subtitle: '中转入口当前只保留占位；等服务就绪后再开放启动。',
            chip: '等待服务',
            chipTone: 'idle'
        }
    }

    return {
        title: '尚未启动',
        subtitle: '点一下就能在这台机器上开启中枢，随后直接打开入口。',
        chip: '等待启动',
        chipTone: 'idle'
    }
}

export function buildFooterMessage(
    actionError: string | null,
    snapshot: HubSnapshot | null,
    viewState: HubViewState,
    entryPreview: EntryPreviewModel,
): string {
    if (actionError) {
        return actionError
    }

    if (snapshot?.lastError) {
        return snapshot.lastError
    }

    if (snapshot?.status?.message) {
        return snapshot.status.message
    }

    if (!viewState.running && entryPreview.mode === 'relay') {
        return '中转入口暂不提供服务；当前不能用这个模式启动中枢。'
    }

    if (!viewState.running && entryPreview.mode === 'lan') {
        return '启动后会监听 0.0.0.0；手机请使用这台电脑的局域网或 Tailscale 地址访问相同端口。'
    }

    if (viewState.running && snapshot?.status?.listenHost === '0.0.0.0') {
        return '当前已监听 0.0.0.0；本机浏览器仍会优先打开 127.0.0.1，其他设备请用这台电脑的局域网或 Tailscale 地址访问相同端口。'
    }

    if (viewState.managed) {
        return '关闭窗口会隐藏到状态栏；从 Dock 或状态栏都能把窗口叫回来。'
    }

    return '启动后就能复制入口和密钥；真正退出时会把本窗口启动的中枢一起收掉。'
}

export function buildOverviewFields(options: BuildOverviewFieldsOptions): FieldModel[] {
    return [
        buildCopyField(
            options.entryPreview.displayLabel,
            options.entryPreview.copyValue,
            options.copyValue,
            EMPTY_ENTRY_MESSAGE,
            options.entryPreview.displayValue || ENTRY_PLACEHOLDER,
        ),
        {
            label: '访问密钥',
            value: compactTokenPreview(options.status?.cliApiToken),
            actionLabel: options.status?.cliApiToken ? '复制' : undefined,
            onAction: options.status?.cliApiToken
                ? () => void options.copyValue(options.status?.cliApiToken, EMPTY_KEY_MESSAGE)
                : undefined,
            mono: true
        }
    ]
}

export function buildOwnershipHint(_viewState: HubViewState): OwnershipHint {
    return {
        title: OWNERSHIP_HINT_TITLE,
        body: MANAGED_HINT_BODY
    }
}

export function buildPrimaryActionLabel(viewState: HubViewState, busy: boolean, canStart: boolean): string {
    if (busy && !viewState.running) {
        return STARTING_PRIMARY_ACTION_LABEL
    }

    if (viewState.managed) {
        return MANAGED_PRIMARY_ACTION_LABEL
    }

    if (!canStart) {
        return '暂不可用'
    }

    return IDLE_PRIMARY_ACTION_LABEL
}

export function buildDetailFields(options: BuildDetailFieldsOptions): FieldModel[] {
    return [
        buildCopyField('本机地址', options.status?.localHubUrl, options.copyValue, EMPTY_ENTRY_MESSAGE),
        buildCopyField('公网地址', options.status?.publicHubUrl, options.copyValue, EMPTY_PUBLIC_MESSAGE),
        buildCopyField('直达链接', options.status?.directAccessUrl, options.copyValue, EMPTY_DIRECT_MESSAGE),
        buildCopyField('日志文件', options.snapshot?.logPath, options.copyValue, EMPTY_LOG_MESSAGE),
        buildCopyField('配置文件', options.status?.settingsFile, options.copyValue, EMPTY_CONFIG_MESSAGE),
        {
            label: '最近更新',
            value: formatRelativeTime(options.status?.updatedAt)
        }
    ]
}

export function getEmptyKeyMessage(): string {
    return EMPTY_KEY_MESSAGE
}
