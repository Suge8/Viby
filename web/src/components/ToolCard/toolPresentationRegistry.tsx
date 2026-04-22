import { isObject } from '@viby/protocol'
import {
    BulbIcon,
    EyeIcon,
    FileDiffIcon,
    GlobeIcon,
    MessageSquareIcon,
    RocketIcon,
    SearchIcon,
    TerminalIcon,
} from '@/components/ToolCard/icons'
import { countLines, DEFAULT_ICON_CLASS } from '@/components/ToolCard/toolPresentationHelpers'
import type { ToolPresentationDefinition } from '@/components/ToolCard/toolPresentationTypes'
import { getInputStringAny, truncate } from '@/lib/toolInputUtils'
import { basename, resolveDisplayPath } from '@/utils/path'
import { codexToolPresentationRegistry } from './toolPresentationCodexRegistry'

function getTaskTitle(opts: Parameters<NonNullable<ToolPresentationDefinition['title']>>[0]): string {
    const name = getInputStringAny(opts.input, ['name'])
    if (name) {
        return `Agent: ${name}`
    }

    const description = getInputStringAny(opts.input, ['description'])
    return description ?? 'Task'
}

function getSendMessageTitle(opts: Parameters<NonNullable<ToolPresentationDefinition['title']>>[0]): string {
    const recipient = getInputStringAny(opts.input, ['recipient'])
    const messageType = getInputStringAny(opts.input, ['type'])

    switch (messageType) {
        case 'broadcast':
            return 'Broadcast'
        case 'shutdown_request':
            return `Shutdown: ${recipient ?? 'agent'}`
        case 'shutdown_response':
            return 'Shutdown Response'
        default:
            return recipient ? `Message: ${recipient}` : 'Send Message'
    }
}

export const toolPresentationRegistry: Record<string, ToolPresentationDefinition> = {
    Task: {
        icon: () => <RocketIcon className={DEFAULT_ICON_CLASS} />,
        title: getTaskTitle,
        subtitle: (opts) => {
            const prompt = getInputStringAny(opts.input, ['prompt'])
            return prompt ? truncate(prompt, 120) : null
        },
        minimal: (opts) => opts.childrenCount === 0,
    },
    SendMessage: {
        icon: () => <MessageSquareIcon className={DEFAULT_ICON_CLASS} />,
        title: getSendMessageTitle,
        subtitle: (opts) => {
            const summary = getInputStringAny(opts.input, ['summary'])
            return summary ? truncate(summary, 120) : null
        },
        minimal: true,
    },
    Bash: {
        icon: () => <TerminalIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => opts.description ?? 'Terminal',
        subtitle: (opts) => getInputStringAny(opts.input, ['command', 'cmd']),
        minimal: true,
    },
    Glob: {
        icon: () => <SearchIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getInputStringAny(opts.input, ['pattern']) ?? 'Search files',
        minimal: true,
    },
    Grep: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const pattern = getInputStringAny(opts.input, ['pattern'])
            return pattern ? `grep(pattern: ${pattern})` : 'Search content'
        },
        minimal: true,
    },
    LS: {
        icon: () => <SearchIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'List files'
        },
        minimal: true,
    },
    shell_command: {
        icon: () => <TerminalIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => opts.description ?? 'Terminal',
        subtitle: (opts) => getInputStringAny(opts.input, ['command', 'cmd']),
        minimal: true,
    },
    Read: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path', 'file'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Read file'
        },
        minimal: true,
    },
    Edit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Edit file'
        },
        minimal: true,
    },
    MultiEdit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            if (!file) {
                return 'Edit file'
            }
            const edits = isObject(opts.input) && Array.isArray(opts.input.edits) ? opts.input.edits : null
            const count = edits ? edits.length : 0
            const path = resolveDisplayPath(file, opts.metadata)
            return count > 1 ? `${path} (${count} edits)` : path
        },
        minimal: true,
    },
    Write: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const file = getInputStringAny(opts.input, ['file_path', 'path'])
            return file ? resolveDisplayPath(file, opts.metadata) : 'Write file'
        },
        subtitle: (opts) => {
            const content = getInputStringAny(opts.input, ['content', 'text'])
            if (!content) {
                return null
            }
            const lines = countLines(content)
            return lines > 1 ? `${lines} lines` : `${content.length} chars`
        },
        minimal: true,
    },
    WebFetch: {
        icon: () => <GlobeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const url = getInputStringAny(opts.input, ['url'])
            if (!url) {
                return 'Web fetch'
            }
            try {
                return new URL(url).hostname
            } catch {
                return url
            }
        },
        subtitle: (opts) => getInputStringAny(opts.input, ['url']) ?? null,
        minimal: true,
    },
    WebSearch: {
        icon: () => <GlobeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getInputStringAny(opts.input, ['query']) ?? 'Web search',
        subtitle: (opts) => {
            const query = getInputStringAny(opts.input, ['query'])
            return query ? truncate(query, 80) : null
        },
        minimal: true,
    },
    NotebookRead: {
        icon: () => <EyeIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['notebook_path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'Read notebook'
        },
        minimal: true,
    },
    NotebookEdit: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const path = getInputStringAny(opts.input, ['notebook_path'])
            return path ? resolveDisplayPath(path, opts.metadata) : 'Edit notebook'
        },
        subtitle: (opts) => {
            const mode = getInputStringAny(opts.input, ['edit_mode'])
            return mode ? `mode: ${mode}` : null
        },
        minimal: false,
    },
    ...codexToolPresentationRegistry,
}
