export const PROPOSED_PLAN_OPEN_TAG = '<proposed_plan>'
export const PROPOSED_PLAN_CLOSE_TAG = '</proposed_plan>'

export type ProposedPlanSegment =
    | {
          kind: 'text'
          text: string
      }
    | {
          kind: 'proposed_plan'
          markdown: string
      }

const PROPOSED_PLAN_BLOCK_PATTERN = new RegExp(
    `${escapeRegExp(PROPOSED_PLAN_OPEN_TAG)}\\r?\\n([\\s\\S]*?)\\r?\\n${escapeRegExp(PROPOSED_PLAN_CLOSE_TAG)}`,
    'g'
)

export function extractProposedPlanSegments(text: string): ProposedPlanSegment[] {
    const segments: ProposedPlanSegment[] = []
    let lastIndex = 0

    for (const match of text.matchAll(PROPOSED_PLAN_BLOCK_PATTERN)) {
        const fullMatch = match[0]
        const markdown = match[1]
        const startIndex = match.index ?? -1
        if (startIndex < 0) {
            continue
        }

        const endIndex = startIndex + fullMatch.length
        if (!hasProposedPlanBoundary(text, startIndex, endIndex)) {
            continue
        }

        if (startIndex > lastIndex) {
            segments.push({
                kind: 'text',
                text: text.slice(lastIndex, startIndex),
            })
        }

        segments.push({
            kind: 'proposed_plan',
            markdown: markdown.trim(),
        })
        lastIndex = endIndex
    }

    if (lastIndex < text.length) {
        segments.push({
            kind: 'text',
            text: text.slice(lastIndex),
        })
    }

    if (segments.length === 0) {
        return [{ kind: 'text', text }]
    }

    return segments
}

function hasProposedPlanBoundary(text: string, startIndex: number, endIndex: number): boolean {
    const startsOnOwnLine = startIndex === 0 || text[startIndex - 1] === '\n'
    const endsOnOwnLine = endIndex === text.length || text[endIndex] === '\n'
    return startsOnOwnLine && endsOnOwnLine
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
