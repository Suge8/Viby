import { PuzzleIcon, WrenchIcon } from '@/components/ToolCard/icons'
import { DEFAULT_ICON_CLASS, formatMCPTitle } from '@/components/ToolCard/toolPresentationHelpers'
import { toolPresentationRegistry } from '@/components/ToolCard/toolPresentationRegistry'
import type { ToolOpts, ToolPresentation } from '@/components/ToolCard/toolPresentationTypes'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'

export type { ToolPresentation } from '@/components/ToolCard/toolPresentationTypes'

export function getToolPresentation(
    opts: Omit<ToolOpts, 'metadata'> & { metadata: ToolOpts['metadata'] }
): ToolPresentation {
    if (opts.toolName.startsWith('mcp__')) {
        return {
            icon: <PuzzleIcon className={DEFAULT_ICON_CLASS} />,
            title: formatMCPTitle(opts.toolName),
            subtitle: null,
            minimal: true,
        }
    }

    const known = toolPresentationRegistry[opts.toolName]
    if (known) {
        const minimal = typeof known.minimal === 'function' ? known.minimal(opts) : (known.minimal ?? false)
        return {
            icon: known.icon(opts),
            title: known.title(opts),
            subtitle: known.subtitle ? known.subtitle(opts) : null,
            minimal,
        }
    }

    const filePath = getInputStringAny(opts.input, ['file_path', 'path', 'filePath', 'file'])
    const command = getInputStringAny(opts.input, ['command', 'cmd'])
    const pattern = getInputStringAny(opts.input, ['pattern'])
    const url = getInputStringAny(opts.input, ['url'])
    const query = getInputStringAny(opts.input, ['query'])
    const subtitle = filePath ?? command ?? pattern ?? url ?? query

    return {
        icon: <WrenchIcon className={DEFAULT_ICON_CLASS} />,
        title: opts.toolName,
        subtitle: subtitle ? truncate(subtitle, 80) : null,
        minimal: true,
    }
}
