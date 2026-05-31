import {
    type PairingTunnelKeyFrame,
    type PairingTunnelPlainFrame,
    PairingTunnelPlainFrameSchema,
    type PairingTunnelSealedFrame,
} from './pairingTunnelFrame'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const AES_KEY_BITS = 256
const ECDH_KEY_BITS = 256
const GCM_NONCE_BYTES = 12
const KEY_INFO = encoder.encode('viby-pairing-tunnel-v1')

export interface PairingTunnelCipher {
    readonly publicKey: string
    isReady(): boolean
    receivePeerKey(publicKey: string): Promise<void>
    seal(frame: PairingTunnelPlainFrame): Promise<PairingTunnelSealedFrame>
    open(frame: PairingTunnelSealedFrame): Promise<PairingTunnelPlainFrame>
}

export async function createPairingTunnelCipher(): Promise<PairingTunnelCipher> {
    const subtle = getSubtle()
    const keyPair = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, [
        'deriveBits',
    ])) as CryptoKeyPair
    const publicKey = toBase64Url(new Uint8Array(await subtle.exportKey('spki', keyPair.publicKey)))
    let sealedKey: CryptoKey | null = null

    return {
        publicKey,
        isReady: () => Boolean(sealedKey),
        receivePeerKey: async (peerPublicKey) => {
            const peerKey = await subtle.importKey(
                'spki',
                fromBase64Url(peerPublicKey),
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
            )
            const sharedBits = await subtle.deriveBits(
                { name: 'ECDH', public: peerKey },
                keyPair.privateKey,
                ECDH_KEY_BITS
            )
            const hkdfKey = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
            sealedKey = await subtle.deriveKey(
                {
                    name: 'HKDF',
                    hash: 'SHA-256',
                    salt: new Uint8Array(new ArrayBuffer(0)),
                    info: toArrayBuffer(KEY_INFO),
                },
                hkdfKey,
                { name: 'AES-GCM', length: AES_KEY_BITS },
                false,
                ['encrypt', 'decrypt']
            )
        },
        seal: async (frame) => {
            if (!sealedKey) throw new Error('pairing tunnel cipher is not ready')
            const nonce = randomBytes(GCM_NONCE_BYTES)
            const ciphertext = await subtle.encrypt(
                { name: 'AES-GCM', iv: nonce },
                sealedKey,
                toArrayBuffer(encoder.encode(JSON.stringify(PairingTunnelPlainFrameSchema.parse(frame))))
            )
            return {
                kind: 'sealed',
                id: frame.id,
                seq: frame.seq,
                nonce: toBase64Url(nonce),
                ciphertext: toBase64Url(new Uint8Array(ciphertext)),
            }
        },
        open: async (frame) => {
            if (!sealedKey) throw new Error('pairing tunnel cipher is not ready')
            const plaintext = await subtle.decrypt(
                { name: 'AES-GCM', iv: fromBase64Url(frame.nonce) },
                sealedKey,
                fromBase64Url(frame.ciphertext)
            )
            const parsed = parsePairingTunnelPlainFrame(parseJson(decoder.decode(plaintext)))
            if (!parsed) throw new Error('invalid pairing tunnel plain frame')
            return parsed
        },
    }
}

export async function tryOpenPairingTunnelPlainFrame(
    cipher: PairingTunnelCipher,
    frame: PairingTunnelSealedFrame
): Promise<PairingTunnelPlainFrame | null> {
    try {
        return await cipher.open(frame)
    } catch {
        return null
    }
}

export function parsePairingTunnelPlainFrame(value: unknown): PairingTunnelPlainFrame | null {
    const parsed = PairingTunnelPlainFrameSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export function createPairingTunnelKeyFrame(input: {
    connectionId?: string
    id: string
    publicKey: string
    seq: number
}): PairingTunnelKeyFrame {
    return { kind: 'key', connectionId: input.connectionId, id: input.id, seq: input.seq, publicKey: input.publicKey }
}

function getSubtle(): SubtleCrypto {
    const subtle = globalThis.crypto?.subtle
    if (!subtle) throw new Error('WebCrypto subtle is unavailable')
    return subtle
}

function randomBytes(size: number): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(new ArrayBuffer(size))
    globalThis.crypto.getRandomValues(bytes)
    return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text) as unknown
    } catch {
        return null
    }
}

export function toPairingTunnelBase64Url(bytes: Uint8Array): string {
    return toBase64Url(bytes)
}

export function fromPairingTunnelBase64Url(value: string): Uint8Array<ArrayBuffer> {
    return fromBase64Url(value)
}

function toBase64Url(bytes: Uint8Array): string {
    let binary = ''
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
    const padded = value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
}
