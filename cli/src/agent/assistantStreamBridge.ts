type AssistantStreamTransport = {
    append(update: { assistantTurnId: string; delta: string }): void
    clear(update: { assistantTurnId?: string }): void
}

export class AssistantStreamBridge {
    private activeAssistantTurnId: string | null = null

    constructor(private readonly transport: AssistantStreamTransport) {}

    beginAssistantTurn(assistantTurnId: string): void {
        this.activeAssistantTurnId = assistantTurnId
    }

    appendTextDelta(delta: string, assistantTurnId?: string): void {
        const resolvedAssistantTurnId = assistantTurnId ?? this.activeAssistantTurnId
        if (!resolvedAssistantTurnId || delta.length === 0) {
            return
        }

        this.activeAssistantTurnId = resolvedAssistantTurnId
        this.transport.append({
            assistantTurnId: resolvedAssistantTurnId,
            delta,
        })
    }

    acknowledgeDurableTurn(assistantTurnId: string | null | undefined): void {
        if (!assistantTurnId || assistantTurnId !== this.activeAssistantTurnId) {
            return
        }

        this.activeAssistantTurnId = null
    }

    clearDanglingAssistantTurn(): void {
        if (!this.activeAssistantTurnId) {
            return
        }

        const assistantTurnId = this.activeAssistantTurnId
        this.activeAssistantTurnId = null
        this.transport.clear({ assistantTurnId })
    }
}
