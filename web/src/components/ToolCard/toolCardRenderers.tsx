import { isObject, safeStringify } from '@viby/protocol'
import type { ReactNode } from 'react'
import type { ToolCallBlock } from '@/chat/types'
import { CodeBlock } from '@/components/CodeBlock'
import { DiffView } from '@/components/DiffView'
import { FeatureRefreshIcon as RefreshIcon } from '@/components/featureIcons'
import { ErrorIcon, LockIcon, SuccessIcon } from '@/components/icons'
import { TextContent } from '@/components/TextContent'
import { getToolPresentation } from '@/components/ToolCard/knownTools'
import { getInputString, getInputStringAny, truncate } from '@/lib/toolInputUtils'
import type { SessionMetadataSummary } from '@/types/api'

const TASK_SUMMARY_VISIBLE_CHILDREN = 3
const TOOL_TITLE_TRUNCATE_LENGTH = 140
export const TOOL_SUBTITLE_TRUNCATE_LENGTH = 160
const NO_TOOL_RESULT_TEXT = '(no output)'
const PLAN_PROPOSAL_TOOL_NAMES = new Set(['ExitPlanMode', 'exit_plan_mode', 'proposed_plan'])

function formatTaskChildLabel(child: ToolCallBlock, metadata: SessionMetadataSummary | null): string {
    const presentation = getToolPresentation({
        toolName: child.tool.name,
        input: child.tool.input,
        result: child.tool.result,
        childrenCount: child.children.length,
        description: child.tool.description,
        metadata,
    })

    if (presentation.subtitle) {
        return truncate(`${presentation.title}: ${presentation.subtitle}`, TOOL_TITLE_TRUNCATE_LENGTH)
    }

    return presentation.title
}

function TaskStateIcon(props: { state: ToolCallBlock['tool']['state'] }) {
    if (props.state === 'completed') {
        return <SuccessIcon className="h-4 w-4 text-emerald-500" strokeWidth={2.1} />
    }
    if (props.state === 'error') {
        return <ErrorIcon className="h-4 w-4 text-rose-500" strokeWidth={2.1} />
    }
    if (props.state === 'pending') {
        return <LockIcon className="h-4 w-4 text-amber-500" strokeWidth={2.05} />
    }
    return <RefreshIcon className="h-4 w-4 animate-spin text-[var(--ds-accent-coral)]" strokeWidth={2.05} />
}

function getTaskSummaryChildren(block: ToolCallBlock): { visible: ToolCallBlock[]; remaining: number } | null {
    if (block.tool.name !== 'Task') {
        return null
    }

    const children = block.children
        .filter((child): child is ToolCallBlock => child.kind === 'tool-call')
        .filter((child) => ['pending', 'running', 'completed', 'error'].includes(child.tool.state))

    if (children.length === 0) {
        return null
    }

    return {
        visible: children.slice(-TASK_SUMMARY_VISIBLE_CHILDREN),
        remaining: children.length - Math.min(children.length, TASK_SUMMARY_VISIBLE_CHILDREN),
    }
}

export function renderTaskSummary(block: ToolCallBlock, metadata: SessionMetadataSummary | null): ReactNode | null {
    const summary = getTaskSummaryChildren(block)
    if (!summary) {
        return null
    }

    return (
        <div className="flex flex-col gap-1 px-1">
            <div className="flex flex-col gap-1">
                {summary.visible.map((child) => (
                    <div key={child.id} className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 font-mono text-xs text-[var(--app-hint)]">
                            <span className="mr-2 inline-block w-4 text-center align-middle">
                                <TaskStateIcon state={child.tool.state} />
                            </span>
                            <span className="align-middle break-all">{formatTaskChildLabel(child, metadata)}</span>
                        </div>
                    </div>
                ))}
                {summary.remaining > 0 ? (
                    <div className="text-xs italic text-[var(--app-hint)]">(+{summary.remaining} more)</div>
                ) : null}
            </div>
        </div>
    )
}

function renderEditInput(input: unknown): ReactNode | null {
    if (!isObject(input)) {
        return null
    }
    const filePath = getInputStringAny(input, ['file_path', 'path']) ?? undefined
    const oldString = getInputString(input, 'old_string')
    const newString = getInputString(input, 'new_string')
    if (oldString === null || newString === null) {
        return null
    }

    return <DiffView oldString={oldString} newString={newString} filePath={filePath} />
}

function renderPlanProposalInput(input: unknown): ReactNode | null {
    if (!isObject(input)) {
        return null
    }

    const plan = getInputString(input, 'plan')
    return plan ? <TextContent text={plan} mode="markdown" /> : null
}

export function renderToolInput(block: ToolCallBlock): ReactNode {
    const toolName = block.tool.name
    const input = block.tool.input

    if (toolName === 'Task' && isObject(input) && typeof input.prompt === 'string') {
        return <TextContent text={input.prompt} mode="markdown" />
    }
    if (toolName === 'Edit') {
        const diff = renderEditInput(input)
        if (diff) {
            return diff
        }
    }
    if (toolName === 'MultiEdit' && isObject(input)) {
        const filePath = getInputStringAny(input, ['file_path', 'path']) ?? undefined
        const edits = Array.isArray(input.edits) ? input.edits : null
        if (edits && edits.length > 0) {
            const rendered = edits
                .slice(0, TASK_SUMMARY_VISIBLE_CHILDREN)
                .map((edit, idx) => {
                    if (!isObject(edit)) {
                        return null
                    }
                    const oldString = getInputString(edit, 'old_string')
                    const newString = getInputString(edit, 'new_string')
                    if (oldString === null || newString === null) {
                        return null
                    }
                    return <DiffView key={idx} oldString={oldString} newString={newString} filePath={filePath} />
                })
                .filter(Boolean)
            if (rendered.length > 0) {
                return (
                    <div className="flex flex-col gap-2">
                        {rendered}
                        {edits.length > TASK_SUMMARY_VISIBLE_CHILDREN ? (
                            <div className="text-xs text-[var(--app-hint)]">
                                (+{edits.length - TASK_SUMMARY_VISIBLE_CHILDREN} more edits)
                            </div>
                        ) : null}
                    </div>
                )
            }
        }
    }
    if (toolName === 'Write' && isObject(input)) {
        const filePath = getInputStringAny(input, ['file_path', 'path'])
        const content = getInputStringAny(input, ['content', 'text'])
        if (filePath && content !== null) {
            return (
                <div className="flex flex-col gap-2">
                    <div className="font-mono text-xs break-all text-[var(--app-hint)]">{filePath}</div>
                    <CodeBlock code={content} language="text" highlight="never" />
                </div>
            )
        }
    }
    if (toolName === 'CodexDiff' && isObject(input) && typeof input.unified_diff === 'string') {
        return <CodeBlock code={input.unified_diff} language="diff" />
    }
    if (PLAN_PROPOSAL_TOOL_NAMES.has(toolName)) {
        const plan = renderPlanProposalInput(input)
        if (plan) {
            return plan
        }
    }

    const commandArray = isObject(input) && Array.isArray(input.command) ? input.command : null
    if (
        (toolName === 'CodexBash' || toolName === 'Bash') &&
        (typeof commandArray?.[0] === 'string' || typeof input === 'object')
    ) {
        const command = Array.isArray(commandArray)
            ? commandArray.filter((part) => typeof part === 'string').join(' ')
            : getInputStringAny(input, ['command', 'cmd'])
        if (command) {
            return <CodeBlock code={command} language="bash" />
        }
    }

    return <CodeBlock code={safeStringify(input)} language="json" highlight="never" />
}

function placeholderForToolState(state: ToolCallBlock['tool']['state']): string {
    if (state === 'pending') {
        return 'Waiting for permission…'
    }
    if (state === 'running') {
        return 'Running…'
    }
    return NO_TOOL_RESULT_TEXT
}

export function getToolResultPlaceholderText(state: ToolCallBlock['tool']['state']): string {
    return placeholderForToolState(state)
}

export function renderToolResultFallback(block: ToolCallBlock): ReactNode {
    const result = block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForToolState(block.tool.state)}</div>
    }
    if (typeof result === 'string') {
        return <TextContent text={result} mode="plain" />
    }
    return <CodeBlock code={safeStringify(result)} language="json" highlight="never" />
}
