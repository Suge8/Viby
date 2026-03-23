import type { DesktopEntryMode, HubSnapshot, HubStartupConfig } from '@/types'

const LOCAL_LISTEN_HOST = '127.0.0.1'
const LAN_LISTEN_HOST = '0.0.0.0'
const DEFAULT_PREVIEW_LISTEN_PORT = 37173
const RELAY_UNAVAILABLE_MESSAGE = '暂不提供服务'
const CURRENT_ADDRESS_LABEL = '当前地址'
const PREVIEW_ADDRESS_LABEL = '启动后地址'

export interface EntryPreviewModel {
    mode: DesktopEntryMode
    displayLabel: string
    displayValue: string
    copyValue?: string
    openUrl?: string
    canStart: boolean
    isPreview: boolean
}

function formatHttpOrigin(host: string, port: number): string {
    return `http://${host}:${port}`
}

function getStartupConfig(snapshot: HubSnapshot | null): HubStartupConfig {
    return snapshot?.startupConfig ?? {
        listenHost: LOCAL_LISTEN_HOST,
        listenPort: DEFAULT_PREVIEW_LISTEN_PORT
    }
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

export function buildEntryPreviewModel(snapshot: HubSnapshot | null, selectedMode: DesktopEntryMode): EntryPreviewModel {
    const status = snapshot?.status
    if (status && snapshot?.running) {
        const runtimeMode = deriveEntryModeFromListenHost(status.listenHost)
        const displayValue = formatHttpOrigin(
            runtimeMode === 'lan' ? LAN_LISTEN_HOST : LOCAL_LISTEN_HOST,
            status.listenPort
        )

        return {
            mode: runtimeMode,
            displayLabel: CURRENT_ADDRESS_LABEL,
            displayValue,
            copyValue: displayValue,
            openUrl: status.preferredBrowserUrl,
            canStart: true,
            isPreview: false
        }
    }

    const startupConfig = getStartupConfig(snapshot)
    if (selectedMode === 'relay') {
        return {
            mode: selectedMode,
            displayLabel: PREVIEW_ADDRESS_LABEL,
            displayValue: RELAY_UNAVAILABLE_MESSAGE,
            canStart: false,
            isPreview: true
        }
    }

    const host = selectedMode === 'lan' ? LAN_LISTEN_HOST : LOCAL_LISTEN_HOST
    const displayValue = formatHttpOrigin(host, startupConfig.listenPort)

    return {
        mode: selectedMode,
        displayLabel: PREVIEW_ADDRESS_LABEL,
        displayValue,
        copyValue: displayValue,
        canStart: true,
        isPreview: true
    }
}
