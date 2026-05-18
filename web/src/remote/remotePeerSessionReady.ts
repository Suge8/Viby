export interface RemotePeerReadyGate {
    reject: (error: Error) => void
    resolve: () => void
    wait: (ready: boolean, error: Error | null) => Promise<void>
}

export function createRemotePeerReadyGate(): RemotePeerReadyGate {
    let promise: Promise<void> | null = null
    let resolveReady: (() => void) | null = null
    let rejectReady: ((error: Error) => void) | null = null

    function clear(): void {
        promise = null
        resolveReady = null
        rejectReady = null
    }

    return {
        reject(error) {
            rejectReady?.(error)
            clear()
        },
        resolve() {
            resolveReady?.()
            clear()
        },
        wait(ready, error) {
            if (ready) return Promise.resolve()
            if (error) return Promise.reject(error)
            promise ??= new Promise<void>((resolve, reject) => {
                resolveReady = resolve
                rejectReady = reject
            })
            return promise
        },
    }
}
