function getCryptoObject(): Crypto | undefined {
    return globalThis.crypto
}

function fillRandomBytes(bytes: Uint8Array): Uint8Array {
    const cryptoObject = getCryptoObject()
    if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
        return cryptoObject.getRandomValues(bytes)
    }

    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256)
    }

    return bytes
}

function formatUuidFromBytes(bytes: Uint8Array): string {
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join('-')
}

export function createRandomId(): string {
    const cryptoObject = getCryptoObject()
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
        return cryptoObject.randomUUID()
    }

    return formatUuidFromBytes(fillRandomBytes(new Uint8Array(16)))
}

export function createScopedId(prefix: string): string {
    return `${prefix}-${createRandomId()}`
}
