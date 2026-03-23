import type { HubRuntimePhase } from '@/types'

export function formatPhaseLabel(phase: HubRuntimePhase | undefined, running: boolean): string {
    if (!phase) {
        return running ? '运行中' : '未启动'
    }

    switch (phase) {
        case 'starting':
            return '启动中'
        case 'ready':
            return '运行中'
        case 'stopped':
            return '已停止'
        case 'error':
            return '异常'
    }
}

export function formatRelativeTime(isoValue: string | undefined): string {
    if (!isoValue) {
        return '暂无'
    }

    const timestamp = Date.parse(isoValue)
    if (Number.isNaN(timestamp)) {
        return isoValue
    }

    const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
    if (diffSeconds < 60) {
        return `${diffSeconds} 秒前`
    }

    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`
    }

    const diffHours = Math.floor(diffMinutes / 60)
    return `${diffHours} 小时前`
}
