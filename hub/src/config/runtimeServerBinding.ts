import { createServer } from 'node:net'
import { resolveLocalApiUrl } from '../hubHelpers'
import { getSettingsFile, readSettingsOrThrow, writeSettings, type Settings } from './settings'

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

function shouldRewritePublicUrl(settings: Settings, previousPort: number): boolean {
    if (!settings.publicUrl) {
        return true
    }

    if (isLoopbackUrl(settings.publicUrl, previousPort)) {
        return true
    }

    return settings.apiUrl === settings.publicUrl
}

export function isAddressInUseError(error: unknown): boolean {
    return Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && (error as { code?: unknown }).code === 'EADDRINUSE'
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

export async function persistResolvedListenPort(options: {
    dataDir: string
    listenHost: string
    previousPort: number
    resolvedPort: number
}): Promise<void> {
    if (options.previousPort === options.resolvedPort) {
        return
    }

    const settingsFile = getSettingsFile(options.dataDir)
    const settings = await readSettingsOrThrow(settingsFile)
    const localHubUrl = resolveLocalApiUrl(options.listenHost, options.resolvedPort)

    settings.listenHost = options.listenHost
    settings.listenPort = options.resolvedPort
    settings.apiUrl = localHubUrl

    if (shouldRewritePublicUrl(settings, options.previousPort)) {
        settings.publicUrl = localHubUrl
    }

    await writeSettings(settingsFile, settings)
}
