import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseVibyLocalSettingsToml } from '../shared/src/localSettings'
import { DEFAULT_VIBY_LISTEN_HOST, DEFAULT_VIBY_LISTEN_PORT } from '../shared/src/runtimeDefaults'

const require = createRequire(import.meta.url)
const base = process.env.VITE_BASE_URL || '/'
const sharedSrcDir = resolve(__dirname, '../shared/src')
const appVersion = require('../cli/package.json').version as string
const appBuildId = process.env.VIBY_APP_BUILD_ID || `${appVersion}-${new Date().toISOString()}`

function normalizeProxyHost(host: string): string {
    if (host === '0.0.0.0' || host === '::') {
        return '127.0.0.1'
    }
    return host
}

function resolveVibyHomeDir(): string {
    const configured = process.env.VIBY_HOME?.replace(/^~/, homedir())
    return configured || join(homedir(), '.viby')
}

function readConfiguredHubTarget(): string {
    if (process.env.VITE_HUB_PROXY) {
        return process.env.VITE_HUB_PROXY
    }

    const envPort = Number(process.env.VIBY_LISTEN_PORT)
    const hasEnvPort = Number.isFinite(envPort) && envPort > 0
    if (hasEnvPort) {
        const host = normalizeProxyHost(process.env.VIBY_LISTEN_HOST || DEFAULT_VIBY_LISTEN_HOST)
        return `http://${host}:${envPort}`
    }

    const settingsFile = join(resolveVibyHomeDir(), 'settings.toml')
    if (existsSync(settingsFile)) {
        try {
            const settings = parseVibyLocalSettingsToml(readFileSync(settingsFile, 'utf8'))
            const host = normalizeProxyHost(settings.listenHost || DEFAULT_VIBY_LISTEN_HOST)
            const port = settings.listenPort || DEFAULT_VIBY_LISTEN_PORT
            return `http://${host}:${port}`
        } catch (error) {
            console.warn('[vite] Failed to read Viby settings.toml, falling back to default hub target:', error)
        }
    }

    return `http://${DEFAULT_VIBY_LISTEN_HOST}:${DEFAULT_VIBY_LISTEN_PORT}`
}

const hubTarget = readConfiguredHubTarget()
const NODE_MODULES_SEGMENT = '/node_modules/'
function resolveProtocolModule(file: string): string {
    return resolve(sharedSrcDir, file)
}

function getManualChunkName(id: string): string | undefined {
    if (!id.includes(NODE_MODULES_SEGMENT)) {
        return undefined
    }

    if (id.includes('/node_modules/@xterm/')) {
        return 'vendor-terminal'
    }

    if (
        id.includes('/node_modules/shiki/')
        || id.includes('/node_modules/hast-util-to-jsx-runtime/')
    ) {
        return 'vendor-syntax'
    }

    if (id.includes('/node_modules/@assistant-ui/react/')) {
        if (id.includes('/dist/primitives/')) {
            return 'vendor-assistant-primitives'
        }

        return 'vendor-assistant-runtime'
    }

    return undefined
}

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(appVersion),
        __APP_BUILD_ID__: JSON.stringify(appBuildId),
    },
    server: {
        host: true,
        allowedHosts: ['vibydev.weishu.me'],
        proxy: {
            '/api': {
                target: hubTarget,
                changeOrigin: true
            },
            '/socket.io': {
                target: hubTarget,
                ws: true
            }
        }
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'mask-icon.svg'],
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            manifest: {
                name: 'Viby',
                short_name: 'Viby',
                description: 'Viby AI-powered development assistant',
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: base,
                start_url: base,
                icons: [
                    {
                        src: 'pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            injectManifest: {
                // `vite-plugin-pwa@1.2.0` + Workbox 7.4 tries to inject back into the
                // compiled service worker in place, which trips Workbox's same-file guard.
                // Keep plugin SW compilation, then finalize manifest injection in a
                // dedicated post-build step that writes through a temporary file.
                injectionPoint: undefined,
            },
            devOptions: {
                enabled: true,
                type: 'module'
            }
        })
    ],
    base,
    resolve: {
        alias: [
            { find: '@', replacement: resolve(__dirname, 'src') },
            { find: '@viby/protocol/messages', replacement: resolveProtocolModule('messages.ts') },
            { find: '@viby/protocol/modes', replacement: resolveProtocolModule('modes.ts') },
            { find: '@viby/protocol/schemas', replacement: resolveProtocolModule('schemas.ts') },
            { find: '@viby/protocol/types', replacement: resolveProtocolModule('types.ts') },
            { find: '@viby/protocol', replacement: resolveProtocolModule('index.ts') },
        ]
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                onlyExplicitManualChunks: true,
                manualChunks(id) {
                    return getManualChunkName(id)
                }
            }
        }
    }
})
