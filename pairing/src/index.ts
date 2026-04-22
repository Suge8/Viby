export * from './config'
export * from './crypto'
export * from './http'
export * from './server'
export * from './store'
export * from './turn'
export * from './ws'

import { readPairingBrokerConfig } from './config'
import { startPairingBroker } from './server'

if (import.meta.main) {
    const config = readPairingBrokerConfig()
    const { server } = await startPairingBroker(config)

    console.log(`[Pairing] listening on http://${server.hostname}:${server.port}`)
    console.log(`[Pairing] public URL: ${config.publicUrl}`)
}
