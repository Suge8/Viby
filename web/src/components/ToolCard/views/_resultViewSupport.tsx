import { isObject, safeStringify } from '@viby/protocol'
import { CodeBlock } from '@/components/CodeBlock'
import { TextContent } from '@/components/TextContent'
import { basename, resolveDisplayPath } from '@/utils/path'
import type { ToolViewProps } from './_all'

const TOOL_RESULT_MAX_DEPTH = 2
export const NO_OUTPUT_TEXT = '(no output)'
export const DONE_TEXT = 'Done'
export const RAW_JSON_LABEL = 'Raw JSON'

export function parseToolUseError(message: string): { isToolUseError: boolean; errorMessage: string | null } {
    const match = message.match(/<tool_use_error>(.*?)<\/tool_use_error>/s)
    if (match) {
        return {
            isToolUseError: true,
            errorMessage: typeof match[1] === 'string' ? match[1].trim() : '',
        }
    }

    return { isToolUseError: false, errorMessage: null }
}

function extractTextFromContentBlock(block: unknown): string | null {
    if (typeof block === 'string') {
        return block
    }
    if (!isObject(block)) {
        return null
    }
    if (block.type === 'text' && typeof block.text === 'string') {
        return block.text
    }
    return typeof block.text === 'string' ? block.text : null
}

export function extractTextFromResult(result: unknown, depth: number = 0): string | null {
    if (depth > TOOL_RESULT_MAX_DEPTH || result === null || result === undefined) {
        return null
    }
    if (typeof result === 'string') {
        const toolUseError = parseToolUseError(result)
        return toolUseError.isToolUseError ? (toolUseError.errorMessage ?? '') : result
    }

    if (Array.isArray(result)) {
        const parts = result
            .map(extractTextFromContentBlock)
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
        return parts.length > 0 ? parts.join('\n') : null
    }

    if (!isObject(result)) {
        return null
    }
    if (typeof result.content === 'string') {
        return result.content
    }
    if (typeof result.text === 'string') {
        return result.text
    }
    if (typeof result.output === 'string') {
        return result.output
    }
    if (typeof result.error === 'string') {
        return result.error
    }
    if (typeof result.message === 'string') {
        return result.message
    }

    const contentArray = Array.isArray(result.content) ? result.content : null
    if (contentArray) {
        const parts = contentArray
            .map(extractTextFromContentBlock)
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
        return parts.length > 0 ? parts.join('\n') : null
    }

    const nestedOutput = isObject(result.output) ? result.output : null
    if (nestedOutput) {
        if (typeof nestedOutput.content === 'string') {
            return nestedOutput.content
        }
        if (typeof nestedOutput.text === 'string') {
            return nestedOutput.text
        }
    }

    const nestedError = isObject(result.error) ? result.error : null
    if (nestedError) {
        if (typeof nestedError.message === 'string') {
            return nestedError.message
        }
        if (typeof nestedError.error === 'string') {
            return nestedError.error
        }
    }

    const nestedResult = isObject(result.result) ? result.result : null
    if (nestedResult) {
        const nestedText = extractTextFromResult(nestedResult, depth + 1)
        if (nestedText) {
            return nestedText
        }
    }

    const nestedData = isObject(result.data) ? result.data : null
    if (nestedData) {
        const nestedText = extractTextFromResult(nestedData, depth + 1)
        if (nestedText) {
            return nestedText
        }
    }

    return null
}

export function parseCodexBashOutput(text: string): {
    exitCode: number | null
    wallTime: string | null
    output: string
} | null {
    const exitMatch = text.match(/^Exit code:\s*(\d+)/m)
    const wallMatch = text.match(/^Wall time:\s*(.+)$/m)
    const outputMatch = text.match(/^Output:\n([\s\S]*)$/m)

    if (!exitMatch && !wallMatch && !outputMatch) {
        return null
    }

    return {
        exitCode: exitMatch ? Number.parseInt(exitMatch[1], 10) : null,
        wallTime: wallMatch ? wallMatch[1].trim() : null,
        output: outputMatch ? outputMatch[1] : text,
    }
}

function looksLikeHtml(text: string): boolean {
    const trimmed = text.trimStart()
    return (
        trimmed.startsWith('<!DOCTYPE') ||
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<div') ||
        trimmed.startsWith('<span')
    )
}

function looksLikeJson(text: string): boolean {
    const trimmed = text.trim()
    return (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
}

export function getMutationResultRenderMode(
    text: string,
    state: ToolViewProps['block']['tool']['state']
): { mode: 'plain' | 'code'; language?: string } {
    const isMultiline = text.split('\n').length > 3
    const mode = state === 'error' || isMultiline ? 'code' : 'plain'
    return { mode, language: mode === 'code' ? 'text' : undefined }
}

export function renderText(
    text: string,
    options: { mode: 'plain' | 'markdown' | 'code'; language?: string } = { mode: 'plain' }
) {
    if (options.mode === 'code') {
        return <CodeBlock code={text} language={options.language ?? 'text'} />
    }
    if (options.mode === 'markdown') {
        return <TextContent text={text} mode="markdown" />
    }
    if (looksLikeHtml(text) || looksLikeJson(text)) {
        return <CodeBlock code={text} language={looksLikeJson(text) ? 'json' : 'html'} highlight="never" />
    }
    return <TextContent text={text} mode="plain" />
}

export function placeholderForState(state: ToolViewProps['block']['tool']['state']): string {
    if (state === 'pending') {
        return 'Waiting for permission…'
    }
    if (state === 'running') {
        return 'Running…'
    }
    return NO_OUTPUT_TEXT
}

export function RawJsonDevOnly(props: { value: unknown }) {
    if (!import.meta.env.DEV || props.value === null || props.value === undefined) {
        return null
    }

    return (
        <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[var(--app-hint)]">{RAW_JSON_LABEL}</summary>
            <div className="mt-2">
                <CodeBlock code={safeStringify(props.value)} language="json" highlight="never" />
            </div>
        </details>
    )
}

export function extractStdoutStderr(result: unknown): { stdout: string | null; stderr: string | null } | null {
    if (!isObject(result)) {
        return null
    }

    const stdout = typeof result.stdout === 'string' ? result.stdout : null
    const stderr = typeof result.stderr === 'string' ? result.stderr : null
    if (stdout !== null || stderr !== null) {
        return { stdout, stderr }
    }

    const nestedOutput = isObject(result.output) ? result.output : null
    if (!nestedOutput) {
        return null
    }

    const nestedStdout = typeof nestedOutput.stdout === 'string' ? nestedOutput.stdout : null
    const nestedStderr = typeof nestedOutput.stderr === 'string' ? nestedOutput.stderr : null
    return nestedStdout !== null || nestedStderr !== null ? { stdout: nestedStdout, stderr: nestedStderr } : null
}

export function extractReadFileContent(result: unknown): { filePath: string | null; content: string } | null {
    if (!isObject(result)) {
        return null
    }
    const file = isObject(result.file) ? result.file : null
    if (!file) {
        return null
    }

    const content = typeof file.content === 'string' ? file.content : null
    if (content === null) {
        return null
    }

    const filePath =
        typeof file.filePath === 'string' ? file.filePath : typeof file.file_path === 'string' ? file.file_path : null

    return { filePath, content }
}

export function resolveReadFileLabel(filePath: string | null, metadata: ToolViewProps['metadata']): string | null {
    if (!filePath) {
        return null
    }
    return basename(resolveDisplayPath(filePath, metadata))
}

export function extractLineList(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}

export function isProbablyMarkdownList(text: string): boolean {
    const trimmed = text.trimStart()
    return trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('1. ')
}
