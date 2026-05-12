import {
    buildHubAccessEntries,
    type HubAccessEntry,
    type HubAccessScope,
    isWildcardListenHost,
} from '@viby/protocol/hubAccessEntries'
import type { DesktopEntryMode, HubSnapshot, HubStartupConfig } from '@/types'

const LOCAL_LISTEN_HOST = '127.0.0.1'
const DEFAULT_PREVIEW_LISTEN_PORT = 37173
const PREVIEW_ADDRESS_LABEL = '启动后地址'

const SCOPE_LABEL: Record<HubAccessScope, string> = {
    public: '公网地址',
    lan: '局域网地址',
    local: '本机地址',
}

export interface EntryPreviewAddress {
    label: string
    value: string
    url?: string
}

export interface EntryPreviewModel {
    mode: DesktopEntryMode
    displayLabel: string
    displayValue: string
    secondaryLabel?: string
    secondaryValue?: string
    secondaryOpenUrl?: string
    openUrl?: string
    entries: EntryPreviewAddress[]
    isPreview: boolean
}

function formatHttpOrigin(host: string, port: number): string {
    return `http://${host}:${port}`
}

function stripHttpScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}

function toEntry(scope: HubAccessScope, url: string): EntryPreviewAddress {
    return { label: SCOPE_LABEL[scope], value: stripHttpScheme(url), url }
}

function entryFromAccess(entry: HubAccessEntry): EntryPreviewAddress {
    return toEntry(entry.scope, entry.url)
}

function getStartupConfig(snapshot: HubSnapshot | null): HubStartupConfig {
    return (
        snapshot?.startupConfig ?? {
            listenHost: LOCAL_LISTEN_HOST,
            listenPort: DEFAULT_PREVIEW_LISTEN_PORT,
            publicAccessEnabled: true,
        }
    )
}

export function deriveEntryModeFromListenHost(listenHost: string | undefined): DesktopEntryMode {
    return listenHost && isWildcardListenHost(listenHost) ? 'lan' : 'local'
}

export function deriveInitialEntryMode(snapshot: HubSnapshot | null): DesktopEntryMode {
    if (snapshot?.running && snapshot.status) {
        return deriveEntryModeFromListenHost(snapshot.status.listenHost)
    }

    return deriveEntryModeFromListenHost(getStartupConfig(snapshot).listenHost)
}

export function buildEntryPreviewModel(snapshot: HubSnapshot | null): EntryPreviewModel {
    const status = snapshot?.status
    if (status && snapshot?.running) {
        const mode = deriveEntryModeFromListenHost(status.listenHost)
        const entries = buildHubAccessEntries(status).map(entryFromAccess)
        const [primary, secondary] = entries

        return {
            mode,
            displayLabel: primary.label,
            displayValue: primary.value,
            secondaryLabel: secondary?.label,
            secondaryValue: secondary?.value,
            secondaryOpenUrl: secondary?.url,
            openUrl: primary.url,
            entries,
            isPreview: false,
        }
    }

    const startupConfig = getStartupConfig(snapshot)
    const displayValue = formatHttpOrigin(LOCAL_LISTEN_HOST, startupConfig.listenPort)

    return {
        mode: deriveEntryModeFromListenHost(startupConfig.listenHost),
        displayLabel: PREVIEW_ADDRESS_LABEL,
        displayValue: stripHttpScheme(displayValue),
        entries: [{ label: PREVIEW_ADDRESS_LABEL, value: stripHttpScheme(displayValue) }],
        isPreview: true,
    }
}
