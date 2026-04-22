import { Store } from '../../hub/src/store'

type ChatRole = 'agent' | 'user'

export type StoredTranscriptSeedInput = {
    content: unknown
    createdAt: number
    localId?: string
}

export function createTranscriptTextMessage(
    role: ChatRole,
    text: string,
    attachments?: unknown,
    meta?: Record<string, unknown>
): Record<string, unknown> {
    if (role === 'agent') {
        return {
            role: 'agent',
            content: {
                type: 'output',
                data: {
                    type: 'assistant',
                    message: {
                        content: [{ type: 'text', text }],
                    },
                },
            },
        }
    }

    return {
        role,
        content: {
            type: 'text',
            text,
            ...(attachments ? { attachments } : {}),
        },
        ...(meta ? { meta } : {}),
    }
}

export function buildAssistantMarkdownWithImage(index: number): string {
    return [
        `Assistant block ${index}`,
        '',
        'This reply intentionally includes a markdown image near the transcript tail so browser smoke exercises late height growth after entry.',
        '',
        '![Harness Image](/agent-codex.png)',
        '',
        '```ts',
        `const transcriptBlock${index} = Array.from({ length: 6 }, (_, line) => line).join(", ")`,
        '```',
        '',
        'Trailing paragraph after the image and code fence.',
    ].join('\n')
}

export function buildLongAssistantTranscriptText(index: number): string {
    return [
        `Assistant block ${index}`,
        '',
        'This is a deliberately long assistant response used to exercise chat bottom anchor behavior.',
        'The viewport should stay pinned to the visible resting bottom without drifting under the fixed composer.',
        '',
        '```md',
        '- bullet 1',
        '- bullet 2',
        '- bullet 3',
        '```',
        '',
        ...Array.from({ length: 10 }, (_, lineIndex) => `Line ${lineIndex + 1}: ${'Long segment '.repeat(6)}`),
    ].join('\n')
}

export function buildRichTranscriptSeedMessages(turnCount: number): StoredTranscriptSeedInput[] {
    const messages: StoredTranscriptSeedInput[] = []
    let createdAt = Date.now() - 60_000

    for (let turnIndex = 0; turnIndex < turnCount; turnIndex += 1) {
        const assistantIndex = turnIndex + 1
        messages.push({
            content: createTranscriptTextMessage(
                'user',
                `User turn ${assistantIndex}`,
                undefined,
                turnIndex === turnCount - 1 ? { sentFrom: 'user' } : undefined
            ),
            createdAt,
        })
        createdAt += 100
        messages.push({
            content: createTranscriptTextMessage(
                'agent',
                turnIndex === turnCount - 1
                    ? buildAssistantMarkdownWithImage(assistantIndex)
                    : buildLongAssistantTranscriptText(assistantIndex)
            ),
            createdAt,
        })
        createdAt += 100
    }

    return messages
}

export function seedStoredSessionMessages(options: {
    dbPath: string
    sessionId: string
    messages: readonly StoredTranscriptSeedInput[]
}): void {
    if (options.messages.length === 0) {
        return
    }

    const store = new Store(options.dbPath)
    store.messages.addMessages(options.sessionId, [...options.messages])
    store.sessions.setSessionAlive(options.sessionId, Date.now())
}
