import { isReachableLocalNetworkUrl } from '@viby/protocol/networkScope'
import type { EntryPreviewModel } from './entryMode'

export interface LanEntryQrModel {
    url: string
    displayValue: string
}

export function buildLanEntryQrModel(input: {
    entryPreview: EntryPreviewModel
    publicAccessEnabled: boolean
}): LanEntryQrModel | null {
    if (input.publicAccessEnabled || input.entryPreview.isPreview || input.entryPreview.mode !== 'lan') return null
    const url = input.entryPreview.openUrl
    if (!url || !isReachableLocalNetworkUrl(url)) return null
    return { url, displayValue: input.entryPreview.displayValue }
}
