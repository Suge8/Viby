import { PairingPeerMethodSchema } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import remotePairingBinaryUploadSource from './remotePairingBinaryUpload.ts?raw'
import remotePairingBridgeSource from './remotePairingBridge.ts?raw'

function collectRequestedMethods(source: string): string[] {
    return [...source.matchAll(/createRemotePeerRequest\('([^']+)'/g)].map((match) => match[1])
}

describe('remote pairing rpc policy', () => {
    it('requests every shared peer method from the mobile bridge owners', () => {
        const sources = [remotePairingBridgeSource, remotePairingBinaryUploadSource]
        const requestedMethods = new Set(sources.flatMap(collectRequestedMethods))

        expect(requestedMethods).toEqual(new Set(PairingPeerMethodSchema.options))
    })
})
