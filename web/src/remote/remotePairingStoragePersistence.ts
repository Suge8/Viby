export async function requestRemotePairingPersistentStorage(): Promise<boolean> {
    const storage = globalThis.navigator?.storage
    if (!storage?.persist) return false

    try {
        return await storage.persist()
    } catch {
        return false
    }
}
