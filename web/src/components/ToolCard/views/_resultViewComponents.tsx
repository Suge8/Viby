import { CodeBlock } from '@/components/CodeBlock'
import { TextContent } from '@/components/TextContent'
import type { ToolViewComponent, ToolViewProps } from '@/components/ToolCard/views/_all'
import {
    DONE_TEXT,
    extractLineList,
    extractReadFileContent,
    extractStdoutStderr,
    extractTextFromResult,
    getMutationResultRenderMode,
    isProbablyMarkdownList,
    NO_OUTPUT_TEXT,
    parseCodexBashOutput,
    parseToolUseError,
    placeholderForState,
    RawJsonDevOnly,
    renderText,
    resolveReadFileLabel,
} from './_resultViewSupport'

export const AskUserQuestionResultView: ToolViewComponent = (props) => {
    const answers = props.block.tool.permission?.answers ?? null
    if (answers && Object.keys(answers).length > 0) {
        return null
    }
    return <MarkdownResultView {...props} />
}

export const BashResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }
    if (typeof result === 'string') {
        const parsedError = parseToolUseError(result)
        const display = parsedError.isToolUseError ? (parsedError.errorMessage ?? '') : result
        return (
            <>
                <CodeBlock code={display} language="text" highlight="never" />
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    const stdio = extractStdoutStderr(result)
    if (stdio) {
        return (
            <>
                <div className="flex flex-col gap-2">
                    {stdio.stdout ? <CodeBlock code={stdio.stdout} language="text" highlight="never" /> : null}
                    {stdio.stderr ? <CodeBlock code={stdio.stderr} language="text" highlight="never" /> : null}
                </div>
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    const text = extractTextFromResult(result)
    return text ? (
        <>
            {renderText(text, { mode: 'code', language: 'text' })}
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const MarkdownResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }
    const text = extractTextFromResult(result)
    return text ? (
        <>
            {renderText(text, { mode: 'markdown' })}
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const LineListResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const text = extractTextFromResult(result)
    if (!text) {
        return (
            <>
                <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
                <RawJsonDevOnly value={result} />
            </>
        )
    }
    if (isProbablyMarkdownList(text)) {
        return (
            <>
                <TextContent text={text} mode="markdown" />
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    const lines = extractLineList(text)
    return lines.length > 0 ? (
        <>
            <div className="flex flex-col gap-1">
                {lines.map((line) => (
                    <div key={line} className="text-sm font-mono break-all text-[var(--app-fg)]">
                        {line}
                    </div>
                ))}
            </div>
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const ReadResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }

    const file = extractReadFileContent(result)
    if (file) {
        const label = resolveReadFileLabel(file.filePath, props.metadata)
        return (
            <>
                {label ? <div className="mb-2 font-mono text-xs break-all text-[var(--app-hint)]">{label}</div> : null}
                <CodeBlock code={file.content} language="text" highlight="never" />
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    const text = extractTextFromResult(result)
    return text ? (
        <>
            {renderText(text, { mode: 'code', language: 'text' })}
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const MutationResultView: ToolViewComponent = (props) => {
    const { result, state } = props.block.tool
    if (result === undefined || result === null) {
        return (
            <div className="text-sm text-[var(--app-hint)]">
                {state === 'completed' ? DONE_TEXT : placeholderForState(state)}
            </div>
        )
    }

    const text = extractTextFromResult(result)
    if (typeof text === 'string' && text.trim().length > 0) {
        const className = state === 'error' ? 'text-[var(--ds-danger)]' : 'text-[var(--app-fg)]'
        const renderMode = getMutationResultRenderMode(text, state)
        return (
            <>
                <div className={`text-sm ${className}`}>{renderText(text, renderMode)}</div>
                <RawJsonDevOnly value={result} />
            </>
        )
    }

    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">{state === 'completed' ? DONE_TEXT : NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const CodexPatchResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    const text = extractTextFromResult(result)
    if (text) {
        return (
            <>
                {renderText(text, { mode: 'plain' })}
                <RawJsonDevOnly value={result} />
            </>
        )
    }
    if (result === undefined || result === null) {
        return (
            <div className="text-sm text-[var(--app-hint)]">
                {props.block.tool.state === 'completed' ? DONE_TEXT : placeholderForState(props.block.tool.state)}
            </div>
        )
    }
    return (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const CodexReasoningResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return <div className="text-sm text-[var(--app-hint)]">{placeholderForState(props.block.tool.state)}</div>
    }
    const text = extractTextFromResult(result)
    return text ? (
        <>
            {renderText(text, { mode: 'plain' })}
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{NO_OUTPUT_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}

export const CodexDiffResultView: ToolViewComponent = (props) => {
    const result = props.block.tool.result
    if (result === undefined || result === null) {
        return (
            <div className="text-sm text-[var(--app-hint)]">
                {props.block.tool.state === 'completed' ? DONE_TEXT : placeholderForState(props.block.tool.state)}
            </div>
        )
    }
    const text = extractTextFromResult(result)
    return text ? (
        <>
            {renderText(text, { mode: 'code', language: 'diff' })}
            <RawJsonDevOnly value={result} />
        </>
    ) : (
        <>
            <div className="text-sm text-[var(--app-hint)]">{DONE_TEXT}</div>
            <RawJsonDevOnly value={result} />
        </>
    )
}
