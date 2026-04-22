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

export function formatTimestamp(unixMs: number | undefined): string {
    if (!unixMs) {
        return '暂无'
    }

    return new Date(unixMs).toLocaleString('zh-CN', {
        hour12: false,
    })
}
