import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { injectManifest } from 'workbox-build'
import { buildAppShellPrecacheManifest } from '../src/lib/swPrecacheManifest'

const DIST_DIR = resolve(import.meta.dir, '..', 'dist')
const SERVICE_WORKER_CANDIDATES = ['sw.js', 'sw.mjs'] as const
const PWA_PRECACHE_GLOB_PATTERNS = ['**/*.{js,css,ico,png,svg,woff,woff2}'] as const
const ASSET_CACHE_BUST_REGEX = /^assets\//

async function resolveServiceWorkerPaths(): Promise<{
    serviceWorkerPath: string
    tempServiceWorkerPath: string
}> {
    for (const fileName of SERVICE_WORKER_CANDIDATES) {
        const serviceWorkerPath = resolve(DIST_DIR, fileName)
        try {
            await access(serviceWorkerPath)
            const tempServiceWorkerPath = resolve(DIST_DIR, fileName.replace(/\.(js|mjs)$/u, '.injected.$1'))
            return { serviceWorkerPath, tempServiceWorkerPath }
        } catch {
            // Try the next emitted service worker filename.
        }
    }

    throw new Error('Compiled service worker not found in dist/')
}

async function finalizeInjectManifest(): Promise<void> {
    const { serviceWorkerPath, tempServiceWorkerPath } = await resolveServiceWorkerPaths()
    const serviceWorkerSource = await readFile(serviceWorkerPath, 'utf8')

    if (!serviceWorkerSource.includes('self.__WB_MANIFEST')) {
        console.log(`[build] skipping service worker manifest injection for ${serviceWorkerPath} (already injected)`)
        return
    }

    const result = await injectManifest({
        swSrc: serviceWorkerPath,
        swDest: tempServiceWorkerPath,
        globDirectory: DIST_DIR,
        globPatterns: [...PWA_PRECACHE_GLOB_PATTERNS],
        dontCacheBustURLsMatching: ASSET_CACHE_BUST_REGEX,
        manifestTransforms: [
            async (entries) => ({
                manifest: buildAppShellPrecacheManifest(entries),
                warnings: [],
            }),
        ],
    })

    await rename(tempServiceWorkerPath, serviceWorkerPath)
    console.log(`[build] finalized service worker manifest injection: ${result.count} entries, ${result.size} bytes`)
}

async function patchManifestLinkCredentials(): Promise<void> {
    // The Web App Manifest fetch defaults to credentials=omit, which means the
    // browser drops the broker-issued pairing manifest cookie when iOS Safari
    // hits `/manifest.webmanifest`. Forcing `crossorigin="use-credentials"`
    // (a same-origin CORS fetch with cookies) is the only spec-conformant way
    // to let the server identify the workspace tab during install. We rewrite
    // here because vite-plugin-pwa overwrites earlier transformIndexHtml hooks.
    for (const fileName of ['index.html', '404.html'] as const) {
        const filePath = resolve(DIST_DIR, fileName)
        try {
            await access(filePath)
        } catch {
            continue
        }
        const original = await readFile(filePath, 'utf8')
        const patched = original.replace(/<link rel="manifest"([^>]*?)>/g, (match, attrs) =>
            attrs.includes('crossorigin=') ? match : `<link rel="manifest" crossorigin="use-credentials"${attrs}>`
        )
        if (patched !== original) {
            await writeFile(filePath, patched, 'utf8')
            console.log(`[build] patched manifest link credentials in ${fileName}`)
        }
    }
}

await finalizeInjectManifest()
await patchManifestLinkCredentials()
