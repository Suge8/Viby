import { encodeBase64 } from '@/lib/utils'

export type FilesTab = 'changes' | 'directories'

export type FileRouteSearch = {
    path: string
    staged?: boolean
    tab?: FilesTab
}

export function createFileRouteSearch(path: string, activeTab: FilesTab, staged?: boolean): FileRouteSearch {
    const search: FileRouteSearch = {
        path: encodeBase64(path),
    }

    if (staged !== undefined) {
        search.staged = staged
    }

    if (activeTab === 'directories') {
        search.tab = activeTab
    }

    return search
}

export function getRootLabel(basePath: string): string {
    const parts = basePath.split(/[/\\]/).filter(Boolean)
    return parts.length > 0 ? parts[parts.length - 1] ?? basePath : basePath
}
