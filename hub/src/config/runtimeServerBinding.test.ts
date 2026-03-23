import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseVibyLocalSettingsToml } from '@viby/protocol/localSettings'
import { findAvailablePort, isAddressInUseError, persistResolvedListenPort } from './runtimeServerBinding'

const tempDirs: string[] = []
const servers: Server[] = []

afterEach(async () => {
    while (servers.length > 0) {
        const server = servers.pop()
        if (!server) {
            continue
        }
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error)
                    return
                }
                resolve()
            })
        })
    }

    while (tempDirs.length > 0) {
        const dir = tempDirs.pop()
        if (!dir) {
            continue
        }
        await rm(dir, { recursive: true, force: true })
    }
})

function createSettingsToml(port: number): string {
    return [
        'cli_api_token = "token"',
        `api_url = "http://localhost:${port}"`,
        'listen_host = "127.0.0.1"',
        `listen_port = ${port}`,
        `public_url = "http://localhost:${port}"`,
        'cors_origins = []',
        '',
        '[system]',
        'machine_id = ""',
        'machine_id_confirmed_by_server = false',
        '',
        '[push]',
        'public_key = ""',
        'private_key = ""',
        '',
    ].join('\n')
}

async function bindRandomServer(): Promise<number> {
    const server = createServer()
    servers.push(server)

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolve())
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('Failed to bind a test port.')
    }

    return address.port
}

describe('runtimeServerBinding', () => {
    it('finds a new port and persists the resolved listen port', async () => {
        const occupiedPort = await bindRandomServer()
        const dataDir = await mkdtemp(join(tmpdir(), 'viby-runtime-binding-'))
        tempDirs.push(dataDir)

        const settingsFile = join(dataDir, 'settings.toml')
        await writeFile(settingsFile, createSettingsToml(occupiedPort))

        const fallbackPort = await findAvailablePort('127.0.0.1')
        expect(fallbackPort).not.toBe(occupiedPort)

        await persistResolvedListenPort({
            dataDir,
            listenHost: '127.0.0.1',
            previousPort: occupiedPort,
            resolvedPort: fallbackPort
        })

        const persisted = parseVibyLocalSettingsToml(await Bun.file(settingsFile).text())
        expect(persisted.listenPort).toBe(fallbackPort)
        expect(persisted.apiUrl).toBe(`http://127.0.0.1:${fallbackPort}`)
        expect(persisted.publicUrl).toBe(`http://127.0.0.1:${fallbackPort}`)
    })

    it('recognizes address-in-use errors', () => {
        expect(isAddressInUseError({ code: 'EADDRINUSE' })).toBe(true)
        expect(isAddressInUseError({ code: 'ENOENT' })).toBe(false)
        expect(isAddressInUseError(null)).toBe(false)
    })
})
