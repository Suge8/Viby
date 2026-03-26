import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { injectManifest } from 'workbox-build'
import { buildAppShellPrecacheManifest } from '../src/lib/swPrecacheManifest'

const DIST_DIR = resolve(import.meta.dir, '..', 'dist')
const SERVICE_WORKER_PATH = resolve(DIST_DIR, 'sw.js')
const TEMP_SERVICE_WORKER_PATH = resolve(DIST_DIR, 'sw.injected.js')
const PWA_PRECACHE_GLOB_PATTERNS = ['**/*.{js,css,ico,png,svg,woff,woff2}'] as const
const ASSET_CACHE_BUST_REGEX = /^assets\//

async function finalizeInjectManifest(): Promise<void> {
    const result = await injectManifest({
        swSrc: SERVICE_WORKER_PATH,
        swDest: TEMP_SERVICE_WORKER_PATH,
        globDirectory: DIST_DIR,
        globPatterns: [...PWA_PRECACHE_GLOB_PATTERNS],
        dontCacheBustURLsMatching: ASSET_CACHE_BUST_REGEX,
        manifestTransforms: [async (entries) => ({
            manifest: buildAppShellPrecacheManifest(entries),
            warnings: []
        })]
    })

    await rename(TEMP_SERVICE_WORKER_PATH, SERVICE_WORKER_PATH)
    console.log(
        `[build] finalized service worker manifest injection: ${result.count} entries, ${result.size} bytes`
    )
}

await finalizeInjectManifest()
