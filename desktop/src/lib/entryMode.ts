import type { DesktopEntryMode, HubSnapshot, HubStartupConfig } from '@/types'

const LOCAL_LISTEN_HOST = '127.0.0.1'
const LAN_LISTEN_HOST = '0.0.0.0'
const DEFAULT_PREVIEW_LISTEN_PORT = 37173
const LAN_ADDRESS_LABEL = '局域网地址'
const LOCAL_ADDRESS_LABEL = '本机地址'
const PREVIEW_ADDRESS_LABEL = '启动后地址'

export interface EntryPreviewModel {
    mode: DesktopEntryMode
    displayLabel: string
    displayValue: string
    secondaryLabel?: string
    secondaryValue?: string
    secondaryOpenUrl?: string
    openUrl?: string
    isPreview: boolean
}

function formatHttpOrigin(host: string, port: number): string {
    return `http://${host}:${port}`
}

function stripHttpScheme(url: string): string {
    return url.replace(/^https?:\/\//, '')
}

function getStartupConfig(snapshot: HubSnapshot | null): HubStartupConfig {
    return (
        snapshot?.startupConfig ?? {
            listenHost: LOCAL_LISTEN_HOST,
            listenPort: DEFAULT_PREVIEW_LISTEN_PORT,
        }
    )
}

export function deriveEntryModeFromListenHost(listenHost: string | undefined): DesktopEntryMode {
    return listenHost === LAN_LISTEN_HOST ? 'lan' : 'local'
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
        const hasLanAddress = mode === 'lan' && status.preferredBrowserUrl !== status.localHubUrl

        return {
            mode,
            displayLabel: hasLanAddress ? LAN_ADDRESS_LABEL : LOCAL_ADDRESS_LABEL,
            displayValue: stripHttpScheme(hasLanAddress ? status.preferredBrowserUrl : status.localHubUrl),
            secondaryLabel: hasLanAddress ? LOCAL_ADDRESS_LABEL : undefined,
            secondaryValue: hasLanAddress ? stripHttpScheme(status.localHubUrl) : undefined,
            secondaryOpenUrl: hasLanAddress ? status.localHubUrl : undefined,
            openUrl: status.preferredBrowserUrl,
            isPreview: false,
        }
    }

    const startupConfig = getStartupConfig(snapshot)
    const displayValue = formatHttpOrigin(LOCAL_LISTEN_HOST, startupConfig.listenPort)

    return {
        mode: deriveEntryModeFromListenHost(startupConfig.listenHost),
        displayLabel: PREVIEW_ADDRESS_LABEL,
        displayValue: stripHttpScheme(displayValue),
        isPreview: true,
    }
}
