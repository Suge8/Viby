let messageWindowStoreModulePromise: Promise<typeof import('@/lib/message-window-store')> | null = null
let messageWindowStoreAsyncModulePromise: Promise<typeof import('@/lib/messageWindowStoreAsync')> | null = null

export function loadMessageWindowStoreModule(): Promise<typeof import('@/lib/message-window-store')> {
    messageWindowStoreModulePromise ??= import('@/lib/message-window-store')
    return messageWindowStoreModulePromise
}

export function loadMessageWindowStoreAsyncModule(): Promise<typeof import('@/lib/messageWindowStoreAsync')> {
    messageWindowStoreAsyncModulePromise ??= import('@/lib/messageWindowStoreAsync')
    return messageWindowStoreAsyncModulePromise
}
