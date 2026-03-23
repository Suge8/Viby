import '@testing-library/jest-dom/vitest'

type StorageLike = Pick<Storage, 'clear' | 'getItem' | 'key' | 'removeItem' | 'setItem'> & {
    readonly length: number
}

function createMemoryStorage(): StorageLike {
    const data = new Map<string, string>()

    return {
        get length() {
            return data.size
        },
        clear() {
            data.clear()
        },
        getItem(key: string) {
            return data.has(key) ? data.get(key)! : null
        },
        key(index: number) {
            return Array.from(data.keys())[index] ?? null
        },
        removeItem(key: string) {
            data.delete(key)
        },
        setItem(key: string, value: string) {
            data.set(String(key), String(value))
        }
    }
}

function ensureStorage(): void {
    const storage = createMemoryStorage()

    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: storage
    })
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        writable: true,
        value: storage
    })
}

ensureStorage()
