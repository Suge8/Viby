import { describe, expect, it } from 'bun:test'
import { PairingPeerMethodSchema } from '@viby/protocol/pairing'

function collectHandledMethods(source: string): string[] {
    return [...source.matchAll(/case '([^']+)'/g)].map((match) => match[1])
}

describe('pairing peer rpc policy', () => {
    it('handles every shared peer method in the desktop dispatch owners', async () => {
        const core = await Bun.file('src/lib/pairingPeerRpcCore.ts').text()
        const peripheral = await Bun.file('src/lib/pairingPeerPeripheralRequests.ts').text()
        const handledMethods = new Set([...collectHandledMethods(core), ...collectHandledMethods(peripheral)])

        expect(handledMethods).toEqual(new Set(PairingPeerMethodSchema.options))
    })
})
