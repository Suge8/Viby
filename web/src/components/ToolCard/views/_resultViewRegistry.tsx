import { CodeBlock } from '@/components/CodeBlock'
import { ChecklistList, extractTodoChecklist } from '@/components/ToolCard/checklist'
import type { ToolViewComponent } from '@/components/ToolCard/views/_all'
import {
    AskUserQuestionResultView,
    BashResultView,
    CodexDiffResultView,
    CodexPatchResultView,
    CodexReasoningResultView,
    LineListResultView,
    MarkdownResultView,
    MutationResultView,
    ReadResultView,
} from './_resultViewComponents'
import {
    extractTextFromResult,
    NO_OUTPUT_TEXT,
    parseCodexBashOutput,
    placeholderForState,
    RawJsonDevOnly,
    renderText,
} from './_resultViewSupport'

const TodoWriteResultView: ToolViewComponent = (props) => {
    const todos = extractTodoChecklist(props.block.tool.input, props.block.tool.result)
    return todos.length === 0 ? (
        <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    ) : (
        <ChecklistList items={todos} />
    )
}

const GenericResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }
    if (typeof result === 'string') {
        const parsed = parseCodexBashOutput(result)
        if (parsed) {
            return (
                <>
                    <div className="mb-2 text-xs text-[var(--app-hint)]">
                        {parsed.exitCode !== null ? `Exit code: ${parsed.exitCode}` : null}
                        {parsed.exitCode !== null && parsed.wallTime ? ' · ' : null}
                        {parsed.wallTime ? `Wall time: ${parsed.wallTime}` : null}
                    </div>
                    {renderText(parsed.output.trim(), { mode: 'code' })}
                    <RawJsonDevOnly value={result} />
                </>
            )
        }
    }

    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'plain' })}
                {typeof result === 'object' ? <RawJsonDevOnly value={result} /> : null}
            </>
        )
    }
    if (typeof result === 'string') {
        return renderText(result, { mode: 'plain' })
    }
    if (result && typeof result === 'object') {
        return <CodeBlock code={JSON.stringify(result, null, 2)} language="json" highlight="never" />
    }
    return <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
}

export const toolResultViewRegistry: Record<string, ToolViewComponent> = {
    Task: MarkdownResultView,
    Bash: BashResultView,
    Glob: LineListResultView,
    Grep: LineListResultView,
    LS: LineListResultView,
    Read: ReadResultView,
    Edit: MutationResultView,
    MultiEdit: MutationResultView,
    Write: MutationResultView,
    WebFetch: MarkdownResultView,
    WebSearch: MarkdownResultView,
    NotebookRead: ReadResultView,
    NotebookEdit: MutationResultView,
    TodoWrite: TodoWriteResultView,
    CodexReasoning: CodexReasoningResultView,
    CodexPatch: CodexPatchResultView,
    CodexDiff: CodexDiffResultView,
    AskUserQuestion: AskUserQuestionResultView,
    ExitPlanMode: MarkdownResultView,
    ask_user_question: AskUserQuestionResultView,
    exit_plan_mode: MarkdownResultView,
    proposed_plan: MarkdownResultView,
}

export function getToolResultViewComponent(toolName: string): ToolViewComponent {
    if (toolName.startsWith('mcp__')) {
        return GenericResultView
    }
    return toolResultViewRegistry[toolName] ?? GenericResultView
}
