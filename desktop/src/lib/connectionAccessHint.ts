/**
 * Decides whether the device card should surface the "all access channels are
 * off, use the local link on the right" hint. The connection page hides the
 * QR action when both public and LAN access are disabled (there is no
 * remotely reachable invite to issue) and the device list is empty, which
 * leaves the card visually empty next to the access list \u2014 the hint points
 * the user at the local-link entry so the page never reads as broken.
 */
export function shouldShowDeviceAllAccessOffHint(input: {
    deviceActionVisible: boolean
    activeDeviceCount: number
}): boolean {
    return !input.deviceActionVisible && input.activeDeviceCount === 0
}
