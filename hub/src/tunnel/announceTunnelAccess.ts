import QRCode from 'qrcode'

import type { HubRuntimeStatusUpdate } from '../runtimeStatus'
import type { TunnelManager } from '.'
import { waitForTunnelTlsReady } from './tlsGate'

interface AnnounceTunnelAccessOptions {
    tunnelUrl: string
    manager: TunnelManager
    officialWebUrl: string
    cliApiToken: string
    localHubUrl: string
    writeRuntimeStatus: (update: HubRuntimeStatusUpdate) => Promise<void>
}

function buildDirectAccessUrl(officialWebUrl: string, tunnelUrl: string, cliApiToken: string): string {
    const params = new URLSearchParams({
        hub: tunnelUrl,
        token: cliApiToken
    })
    return `${officialWebUrl}/?${params.toString()}`
}

export async function announceTunnelAccess(options: AnnounceTunnelAccessOptions): Promise<void> {
    const { tunnelUrl, manager, officialWebUrl, cliApiToken, localHubUrl, writeRuntimeStatus } = options
    const tlsReady = await waitForTunnelTlsReady(tunnelUrl, manager)
    if (!tlsReady) {
        console.log('[Tunnel] Tunnel stopped before TLS was ready.')
        await writeRuntimeStatus({
            phase: 'ready',
            preferredBrowserUrl: localHubUrl,
            message: '公网入口暂时不可用，已保留本地入口。'
        })
        return
    }

    console.log('[Web] Public: ' + tunnelUrl)

    const directAccessUrl = buildDirectAccessUrl(officialWebUrl, tunnelUrl, cliApiToken)
    await writeRuntimeStatus({
        phase: 'ready',
        preferredBrowserUrl: directAccessUrl,
        publicHubUrl: tunnelUrl,
        directAccessUrl,
        message: '公网入口已就绪。'
    })

    console.log('')
    console.log('Open in browser:')
    console.log(`  ${directAccessUrl}`)
    console.log('')
    console.log('or scan the QR code to open:')

    try {
        const qrString = await QRCode.toString(directAccessUrl, {
            type: 'terminal',
            small: true,
            margin: 1,
            errorCorrectionLevel: 'L'
        })
        console.log('')
        console.log(qrString)
    } catch {
        // QR code generation failure should not affect main flow
    }
}
