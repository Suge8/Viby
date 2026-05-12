let publishedRegistration: ServiceWorkerRegistration | null | undefined
let pendingRegistration: Promise<ServiceWorkerRegistration | null> | null = null
let resolvePendingRegistration: ((registration: ServiceWorkerRegistration | null) => void) | null = null

function createPendingRegistration(): Promise<ServiceWorkerRegistration | null> {
    return new Promise((resolve) => {
        resolvePendingRegistration = resolve
    })
}

export function publishRuntimeServiceWorkerRegistration(registration: ServiceWorkerRegistration | null): void {
    publishedRegistration = registration
    resolvePendingRegistration?.(registration)
    resolvePendingRegistration = null
    pendingRegistration = null
}

export function waitForRuntimeServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (publishedRegistration !== undefined) {
        return Promise.resolve(publishedRegistration)
    }

    pendingRegistration ??= createPendingRegistration()
    return pendingRegistration
}

export function resetRuntimeServiceWorkerRegistrationForTests(): void {
    publishedRegistration = undefined
    resolvePendingRegistration = null
    pendingRegistration = null
}
