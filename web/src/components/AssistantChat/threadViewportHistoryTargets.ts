type ConversationLookup = {
    orderedMessageIds: readonly string[]
    jumpTargetIds: ReadonlySet<string>
    indexById: ReadonlyMap<string, number>
}

type ResolveVisibleJumpTargetOptions = {
    threadMessageOwnerById: ReadonlyMap<string, string>
    referenceMessageId: string | null
    conversationLookup: ConversationLookup
}

export function createConversationLookup(
    conversationMessageIds: readonly string[],
    historyJumpTargetMessageIds: readonly string[]
): ConversationLookup {
    const indexById = new Map<string, number>()
    for (const [index, messageId] of conversationMessageIds.entries()) {
        indexById.set(messageId, index)
    }

    return {
        orderedMessageIds: conversationMessageIds,
        jumpTargetIds: new Set(historyJumpTargetMessageIds),
        indexById
    }
}

export function resolveConversationMessageId(
    threadMessageOwnerById: ReadonlyMap<string, string>,
    messageId: string | null
): string | null {
    if (!messageId) {
        return null
    }

    return threadMessageOwnerById.get(messageId) ?? messageId
}

export function resolvePreviousUserTargetId(options: {
    conversationLookup: ConversationLookup
    threadMessageOwnerById: ReadonlyMap<string, string>
    referenceMessageId: string | null
}): string | null {
    const conversationMessageId = resolveConversationMessageId(
        options.threadMessageOwnerById,
        options.referenceMessageId
    )
    if (!conversationMessageId) {
        return null
    }

    const referenceIndex = options.conversationLookup.indexById.get(conversationMessageId)
    if (referenceIndex === undefined) {
        return null
    }

    for (let index = referenceIndex - 1; index >= 0; index -= 1) {
        const candidateId = options.conversationLookup.orderedMessageIds[index]
        if (options.conversationLookup.jumpTargetIds.has(candidateId)) {
            return candidateId
        }
    }

    return null
}

export function resolveVisibleJumpTargetId(options: ResolveVisibleJumpTargetOptions): string | null {
    return resolvePreviousUserTargetId({
        conversationLookup: options.conversationLookup,
        threadMessageOwnerById: options.threadMessageOwnerById,
        referenceMessageId: options.referenceMessageId
    })
}
