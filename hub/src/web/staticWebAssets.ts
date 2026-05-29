import { WEB_BUILD_METADATA_FILE_NAME } from '@viby/protocol'
import type { Context, Hono, Next } from 'hono'
import { serveStatic } from 'hono/bun'
import type { EmbeddedWebAsset } from './embeddedAssets'
import type { WebAppEnv } from './middleware/auth'
import { findWebappDistDir } from './webAssetDist'

function getWebAssetCacheControl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`

    if (
        normalizedPath === '/' ||
        normalizedPath === '/sw.js' ||
        normalizedPath === `/${WEB_BUILD_METADATA_FILE_NAME}` ||
        normalizedPath === '/manifest.webmanifest' ||
        normalizedPath.endsWith('.html')
    ) {
        return 'no-cache, no-store, must-revalidate'
    }

    if (normalizedPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable'

    return 'public, max-age=3600'
}

function serveEmbeddedAsset(asset: EmbeddedWebAsset): Response {
    return new Response(Bun.file(asset.sourcePath), {
        headers: {
            'Content-Type': asset.mimeType,
            'Cache-Control': getWebAssetCacheControl(asset.path),
        },
    })
}

async function serveStaticWithCacheControl(
    c: Context<WebAppEnv>,
    next: Next,
    options: Parameters<typeof serveStatic<WebAppEnv>>[0],
    cachePath: string
): Promise<Response | void> {
    const response = await serveStatic(options)(c, next)
    if (response instanceof Response) response.headers.set('Cache-Control', getWebAssetCacheControl(cachePath))
    return response
}

function registerEmbeddedWebAssets(app: Hono<WebAppEnv>, embeddedAssetMap: Map<string, EmbeddedWebAsset>): void {
    const indexHtmlAsset = embeddedAssetMap.get('/index.html')
    if (!indexHtmlAsset) {
        app.get('*', (c) =>
            c.text(
                'Embedded web app is missing index.html. Rebuild the executable after running bun run build:web.',
                503
            )
        )
        return
    }

    app.use('*', async (c, next) => {
        if (c.req.path.startsWith('/api') || (c.req.method !== 'GET' && c.req.method !== 'HEAD')) return await next()

        const asset = embeddedAssetMap.get(c.req.path)
        return asset ? serveEmbeddedAsset(asset) : await next()
    })

    app.get('*', async (c, next) => {
        if (c.req.path.startsWith('/api')) {
            await next()
            return
        }

        return serveEmbeddedAsset(indexHtmlAsset)
    })
}

function registerDistWebAssets(app: Hono<WebAppEnv>): void {
    const webappDist = findWebappDistDir()

    if (webappDist.status === 'missing') {
        app.get('/', (c) => c.text('Web app is not built.\n\nRun:\n  cd web\n  bun install\n  bun run build\n', 503))
        return
    }

    if (webappDist.status === 'incompatible') {
        app.get('*', (c) => c.text('Web app build is incompatible with this Hub. Rebuild web and hub together.', 503))
        return
    }

    const { distDir } = webappDist
    app.use('/assets/*', async (c, next) => serveStaticWithCacheControl(c, next, { root: distDir }, c.req.path))
    app.use('*', async (c, next) => {
        if (c.req.path.startsWith('/api')) {
            await next()
            return
        }

        return serveStaticWithCacheControl(c, next, { root: distDir }, c.req.path)
    })
    app.get('*', async (c, next) => {
        if (c.req.path.startsWith('/api')) {
            await next()
            return
        }

        return serveStaticWithCacheControl(c, next, { root: distDir, path: 'index.html' }, '/index.html')
    })
}

export function registerWebAssetRoutes(
    app: Hono<WebAppEnv>,
    embeddedAssetMap: Map<string, EmbeddedWebAsset> | null
): void {
    if (embeddedAssetMap) {
        registerEmbeddedWebAssets(app, embeddedAssetMap)
        return
    }

    registerDistWebAssets(app)
}
