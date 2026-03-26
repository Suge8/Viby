type SessionChatLoadingContractOptions = {
    messagesCount: number
    isDetailPending?: boolean
    hasLoadedLatestMessages: boolean
    hasWarmSessionSnapshot?: boolean
}

function hasStableSessionChatShell(options: SessionChatLoadingContractOptions): boolean {
    return options.messagesCount > 0 || options.hasWarmSessionSnapshot === true
}

export function shouldShowSessionChatPendingShell(
    options: SessionChatLoadingContractOptions
): boolean {
    if (hasStableSessionChatShell(options)) {
        return false
    }

    return options.isDetailPending === true || !options.hasLoadedLatestMessages
}

export function shouldPreloadSessionChatWorkspace(
    options: SessionChatLoadingContractOptions
): boolean {
    return hasStableSessionChatShell(options) || options.hasLoadedLatestMessages
}
