import { renderLandingPageMarkup } from './landingPageMarkup'
import { renderLandingPageScript } from './landingPageScript'
import { landingPageStylesBase } from './landingPageStylesBase'
import { landingPageStylesSurface } from './landingPageStylesSurface'

export function renderPairingLandingHtml(pairingId: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Viby Remote Pairing</title>
  <style>
${landingPageStylesBase}
${landingPageStylesSurface}
  </style>
</head>
<body>
  ${renderLandingPageMarkup(pairingId)}
  <script>
${renderLandingPageScript(pairingId)}
  </script>
</body>
</html>`
}
