import { randomUUID } from 'node:crypto'
import type { ApiSessionClient } from '../api/apiSession.js'

const TITLE_MAX_LENGTH = 50
const TITLE_ELLIPSIS = '...'
const TITLE_PREFIXES = ['请', '帮我', '帮忙', '能否', '可以', '麻烦'] as const

export class TitleManager {
    private hasGeneratedTitle = false

    generateTitle(message: string): string {
        let text = message.replace(/\s+/g, ' ').trim()

        for (const prefix of TITLE_PREFIXES) {
            if (text.startsWith(prefix)) {
                text = text.slice(prefix.length).trim()
                break
            }
        }

        if (text.length <= TITLE_MAX_LENGTH) {
            return text
        }

        const maxContentLength = TITLE_MAX_LENGTH - TITLE_ELLIPSIS.length
        return text.slice(0, maxContentLength) + TITLE_ELLIPSIS
    }

    handleMessage(client: ApiSessionClient, message: string): void {
        if (
            this.hasGeneratedTitle ||
            client.getMetadataSnapshot()?.summary?.text?.trim() ||
            client.getObservedAutoSummarySnapshot()?.text?.trim()
        ) {
            this.hasGeneratedTitle = true
            return
        }

        const title = this.generateTitle(message)
        if (!title) {
            return
        }

        this.hasGeneratedTitle = true
        client.sendClaudeSessionMessage({
            type: 'summary',
            summary: title,
            leafUuid: randomUUID(),
        })
    }
}
