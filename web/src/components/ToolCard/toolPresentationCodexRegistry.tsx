import { isObject } from '@viby/protocol'
import { BulbIcon, ClipboardIcon, EyeIcon, FileDiffIcon, QuestionIcon, TerminalIcon } from '@/components/ToolCard/icons'
import {
    countLines,
    DEFAULT_ICON_CLASS,
    formatChecklistCount,
    getQuestionSubtitle,
    getQuestionTitle,
} from '@/components/ToolCard/toolPresentationHelpers'
import type { ToolPresentationDefinition } from '@/components/ToolCard/toolPresentationTypes'
import { getInputStringAny } from '@/lib/toolInputUtils'
import { basename, resolveDisplayPath } from '@/utils/path'
import { extractTodoChecklist, extractUpdatePlanChecklist } from './checklist'

function createQuestionPresentation(primaryField: 'header' | 'id'): ToolPresentationDefinition {
    return {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getQuestionTitle(opts.input, 'Question', primaryField),
        subtitle: (opts) => getQuestionSubtitle(opts.input),
        minimal: true,
    }
}

export const codexToolPresentationRegistry: Record<string, ToolPresentationDefinition> = {
    CodexBash: {
        icon: (opts) => {
            if (isObject(opts.input) && Array.isArray(opts.input.parsed_cmd) && opts.input.parsed_cmd.length > 0) {
                const first = opts.input.parsed_cmd[0]
                const type = isObject(first) ? first.type : null
                if (type === 'read') {
                    return <EyeIcon className={DEFAULT_ICON_CLASS} />
                }
                if (type === 'write') {
                    return <FileDiffIcon className={DEFAULT_ICON_CLASS} />
                }
            }
            return <TerminalIcon className={DEFAULT_ICON_CLASS} />
        },
        title: (opts) => {
            if (isObject(opts.input) && Array.isArray(opts.input.parsed_cmd) && opts.input.parsed_cmd.length === 1) {
                const parsed = opts.input.parsed_cmd[0]
                if (isObject(parsed) && parsed.type === 'read' && typeof parsed.name === 'string') {
                    return resolveDisplayPath(parsed.name, opts.metadata)
                }
            }
            return opts.description ?? 'Terminal'
        },
        subtitle: (opts) => {
            const command = getInputStringAny(opts.input, ['command', 'cmd'])
            if (command) {
                return command
            }
            if (isObject(opts.input) && Array.isArray(opts.input.command)) {
                return opts.input.command.filter((part) => typeof part === 'string').join(' ')
            }
            return null
        },
        minimal: true,
    },
    CodexPermission: {
        icon: () => <QuestionIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => {
            const tool = getInputStringAny(opts.input, ['tool'])
            return tool ? `Permission: ${tool}` : 'Permission request'
        },
        subtitle: (opts) => getInputStringAny(opts.input, ['message', 'command']) ?? null,
        minimal: true,
    },
    CodexReasoning: {
        icon: () => <BulbIcon className={DEFAULT_ICON_CLASS} />,
        title: (opts) => getInputStringAny(opts.input, ['title']) ?? 'Reasoning',
        minimal: true,
    },
    CodexPatch: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Apply changes',
        subtitle: (opts) => {
            if (isObject(opts.input) && isObject(opts.input.changes)) {
                const files = Object.keys(opts.input.changes)
                if (files.length === 0) {
                    return null
                }
                const display = resolveDisplayPath(files[0], opts.metadata)
                const name = basename(display)
                return files.length > 1 ? `${name} (+${files.length - 1})` : name
            }
            return null
        },
        minimal: true,
    },
    CodexDiff: {
        icon: () => <FileDiffIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Diff',
        subtitle: (opts) => {
            const unified = getInputStringAny(opts.input, ['unified_diff'])
            if (!unified) {
                return null
            }
            for (const line of unified.split('\n')) {
                if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
                    const fileName = line.replace(/^\+\+\+ (b\/)?/, '')
                    return fileName.split('/').pop() ?? fileName
                }
            }
            return null
        },
        minimal: (opts) => {
            const unified = getInputStringAny(opts.input, ['unified_diff'])
            return !unified || unified.length >= 2000 || countLines(unified) >= 50
        },
    },
    TodoWrite: {
        icon: () => <BulbIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Todo list',
        subtitle: (opts) => formatChecklistCount(extractTodoChecklist(opts.input, opts.result), 'item'),
        minimal: (opts) => extractTodoChecklist(opts.input, opts.result).length === 0,
    },
    update_plan: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan',
        subtitle: (opts) => formatChecklistCount(extractUpdatePlanChecklist(opts.input, opts.result), 'step'),
        minimal: (opts) => extractUpdatePlanChecklist(opts.input, opts.result).length === 0,
    },
    ExitPlanMode: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan proposal',
        minimal: false,
    },
    exit_plan_mode: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Plan proposal',
        minimal: false,
    },
    proposed_plan: {
        icon: () => <ClipboardIcon className={DEFAULT_ICON_CLASS} />,
        title: () => 'Proposed Plan',
        minimal: false,
    },
    AskUserQuestion: createQuestionPresentation('header'),
    ask_user_question: createQuestionPresentation('header'),
    request_user_input: createQuestionPresentation('id'),
}
