import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPairingWorkspaceIntent } from '@viby/protocol/pairing'

type WebAppAssetOptions = {
    indexHtml?: string
    assetsRoot?: string
}

type WebAppAsset = {
    body: ArrayBuffer
    contentType: string
    cacheControl: string
}

type CachedAsset = WebAppAsset & { path: string }

const WEB_INDEX_FILE_NAME = 'web-index.html'
const WEB_MANIFEST_FILE_NAME = 'manifest.webmanifest'
const PAIRING_PWA_START_URL = withPairingWorkspaceIntent('/sessions')
const WEB_ROOT_ASSET_FILE_NAMES = new Set([
    'agent-claude-favicon.png',
    'agent-claude.png',
    'agent-codex-source.png',
    'agent-codex-v3.png',
    'agent-codex-v4.png',
    'agent-codex-v5.png',
    'agent-codex-v6.png',
    'agent-codex-v7.png',
    'agent-codex-v8.png',
    'agent-codex.png',
    'agent-copilot.svg',
    'agent-cursor.ico',
    'agent-gemini.svg',
    'agent-openai-dev-favicon.png',
    'agent-opencode.png',
    'agent-pi.svg',
    'apple-touch-icon-180x180.png',
    'brand-logo-tight.png',
    'favicon.ico',
    'icon.svg',
    WEB_MANIFEST_FILE_NAME,
    'mask-icon.svg',
    'maskable-icon-512x512.png',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-64x64.png',
    'sw.js',
])

const assetCache = new Map<string, CachedAsset>()
const indexCache = new Map<string, string>()
const moduleDir = dirname(fileURLToPath(import.meta.url))
const candidateRoots = [
    process.cwd(),
    join(moduleDir, '..'),
    join(moduleDir, '..', '..', 'web', 'dist'),
    join(process.cwd(), 'web', 'dist'),
]

function resolveWebRoot(options?: WebAppAssetOptions): string {
    if (options?.assetsRoot) {
        return options.assetsRoot
    }
    const root = candidateRoots.find((candidate) => existsSync(join(candidate, WEB_INDEX_FILE_NAME)))
    if (root) {
        return root
    }
    const webDist = candidateRoots.find((candidate) => existsSync(join(candidate, 'index.html')))
    if (webDist) {
        return webDist
    }
    throw new Error('Missing Web app assets. Run `bun run --cwd web build` and rebuild the pairing deploy bundle.')
}

function getContentType(path: string): string {
    if (path.endsWith('.js')) {
        return 'text/javascript; charset=utf-8'
    }
    if (path.endsWith('.css')) {
        return 'text/css; charset=utf-8'
    }
    if (path.endsWith('.svg')) {
        return 'image/svg+xml'
    }
    if (path.endsWith('.png')) {
        return 'image/png'
    }
    if (path.endsWith('.ico')) {
        return 'image/x-icon'
    }
    if (path.endsWith('.webmanifest')) {
        return 'application/manifest+json; charset=utf-8'
    }
    return 'application/octet-stream'
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function resolveSafeAssetPath(root: string, requestPath: string): string | null {
    const cleanPath = normalize(requestPath.replace(/^\/+/, ''))
    const targetPath = join(root, cleanPath)
    const relativePath = relative(root, targetPath)
    if (relativePath.startsWith('..') || relativePath === '') {
        return null
    }
    return targetPath
}

export function readWebAppIndexHtml(options?: WebAppAssetOptions): string {
    if (options?.indexHtml) {
        return options.indexHtml
    }
    const root = resolveWebRoot(options)
    const cached = indexCache.get(root)
    if (cached) {
        return cached
    }
    const bundleIndex = join(root, WEB_INDEX_FILE_NAME)
    const html = readFileSync(existsSync(bundleIndex) ? bundleIndex : join(root, 'index.html'), 'utf8')
    indexCache.set(root, html)
    return html
}

function buildServedAssetBody(targetPath: string, rootAssetName: string): ArrayBuffer {
    const body = readFileSync(targetPath)
    if (rootAssetName !== WEB_MANIFEST_FILE_NAME) {
        return toArrayBuffer(body)
    }

    const manifest = JSON.parse(body.toString('utf8')) as Record<string, unknown>
    const rewritten = JSON.stringify({ ...manifest, scope: '/', start_url: PAIRING_PWA_START_URL })
    return toArrayBuffer(new TextEncoder().encode(rewritten))
}

export function readWebAppAsset(requestPath: string, options?: WebAppAssetOptions): WebAppAsset | null {
    const root = resolveWebRoot(options)
    const normalizedPath = requestPath.startsWith('/assets/') ? requestPath : `/${requestPath.replace(/^\/+/, '')}`
    const safePath = normalize(normalizedPath).replace(/\\/g, '/')
    const rootAssetName = safePath.slice(1)
    const isHashedAsset = safePath.startsWith('/assets/') && !safePath.slice('/assets/'.length).includes('/')
    const isRootAsset = safePath === normalizedPath && WEB_ROOT_ASSET_FILE_NAMES.has(rootAssetName)
    if (!isHashedAsset && !isRootAsset) {
        return null
    }
    const targetPath = resolveSafeAssetPath(root, safePath)
    if (!targetPath || !existsSync(targetPath)) {
        return null
    }
    const cacheKey = `${root}:${safePath}`
    const cached = assetCache.get(cacheKey)
    if (cached?.path === targetPath) {
        return cached
    }
    const asset = {
        body: buildServedAssetBody(targetPath, rootAssetName),
        contentType: getContentType(targetPath),
        cacheControl: isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        path: targetPath,
    }
    assetCache.set(cacheKey, asset)
    return asset
}
