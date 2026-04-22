import { landingPageTransportScript } from './landingPageScriptTransport'
import { renderLandingPageUiScript } from './landingPageScriptUi'

export function renderLandingPageScript(pairingId: string): string {
    return `${renderLandingPageUiScript(pairingId)}
${landingPageTransportScript}`
}
