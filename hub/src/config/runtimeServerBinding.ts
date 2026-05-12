import { createServer } from 'node:net'
import { resolveDefaultPublicApiUrl, resolveLocalApiUrl } from '../hubHelpers'
import { getSettingsFile, readSettingsOrThrow, type Settings } from './settings'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0', '::', '::1', '[::1]'])

function isLoopbackUrl(value: string, port: number): boolean {
    try {
        const parsed = new URL(value)
        const parsedPort = parsed.port ? Number(parsed.port) : 80
        return LOOPBACK_HOSTS.has(parsed.hostname) && parsedPort === port
    } catch {
        return false
    }
}

function hasCustomPublicUrl(settings: Settings, previousPort: number): settings is Settings & { publicUrl: string } {
    if (!settings.publicUrl) return false
    if (isLoopbackUrl(settings.publicUrl, previousPort)) return false
    return settings.apiUrl !== settings.publicUrl
}

export function isAddressInUseError(error: unknown): boolean {
    return Boolean(
        error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'EADDRINUSE'
    )
}

export async function findAvailablePort(listenHost: string): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
        const server = createServer()

        server.once('error', reject)
        server.listen({ host: listenHost, port: 0 }, () => {
            const address = server.address()
            if (!address || typeof address === 'string') {
                server.close(() => reject(new Error('Failed to resolve an available port.')))
                return
            }

            const port = address.port
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve(port)
            })
        })
    })
}

export async function resolveFallbackRuntimePublicUrl(options: {
    dataDir: string
    listenHost: string
    previousPort: number
    resolvedPort: number
}): Promise<string> {
    if (options.previousPort === options.resolvedPort) {
        return resolveLocalApiUrl(options.listenHost, options.resolvedPort)
    }

    const settings = await readSettingsOrThrow(getSettingsFile(options.dataDir))
    if (hasCustomPublicUrl(settings, options.previousPort)) {
        return settings.publicUrl
    }

    return resolveDefaultPublicApiUrl(options.listenHost, options.resolvedPort)
}
