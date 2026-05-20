const STYLESHEET_LINK_PATTERN = /<link\s+([^>]*\brel="stylesheet"[^>]*)>/g
const HREF_PATTERN = /\bhref="([^"]+)"/

function readHref(attributes: string): string | null {
    return HREF_PATTERN.exec(attributes)?.[1] ?? null
}

function isGeneratedAppStylesheet(href: string): boolean {
    return /^\/?assets\/.+\.css(?:[?#].*)?$/.test(href)
}

function cleanStylesheetAttributes(attributes: string): string {
    return attributes
        .replace(/\s*\brel="stylesheet"/, '')
        .replace(/\s*\bhref="[^"]+"/, '')
        .replace(/\s*\bdata-viby-nonblocking-style="true"/, '')
        .trim()
}

function renderAttributeSuffix(attributes: string): string {
    return attributes ? ` ${attributes}` : ''
}

export function deferRenderBlockingStylesheets(html: string): string {
    return html.replace(STYLESHEET_LINK_PATTERN, (match, attributes: string) => {
        if (match.includes('data-viby-nonblocking-style="true"')) return match
        const href = readHref(attributes)
        if (!href || !isGeneratedAppStylesheet(href)) return match

        const suffix = renderAttributeSuffix(cleanStylesheetAttributes(attributes))
        return [
            `<link rel="preload" as="style" href="${href}"${suffix} data-viby-nonblocking-style="true" onload="this.onload=null;this.rel='stylesheet'">`,
            `<noscript><link rel="stylesheet" href="${href}"${suffix}></noscript>`,
        ].join('')
    })
}
