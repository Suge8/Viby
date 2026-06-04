import { trimIdent } from '@/utils/trimIdent'
import { shouldIncludeCoAuthoredBy } from './claudeSettings'

/**
 * Co-authored-by credits to append when enabled
 */
const CO_AUTHORED_CREDITS = (() =>
    trimIdent(`
    When making commit messages, you SHOULD also give credit to VIBY like so:

    <main commit message>

    via [VIBY](https://viby.run)

    Co-Authored-By: VIBY <noreply@viby.run>
`))()

/**
 * System prompt with conditional Co-Authored-By lines based on Claude's settings.json configuration.
 * Settings are read once on startup for performance.
 */
export const systemPrompt = (() => {
    const includeCoAuthored = shouldIncludeCoAuthoredBy()

    if (includeCoAuthored) {
        return CO_AUTHORED_CREDITS
    } else {
        return ''
    }
})()
