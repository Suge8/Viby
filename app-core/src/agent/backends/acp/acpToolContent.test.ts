import { describe, expect, it } from 'vitest'
import type { AgentMessage } from '@/agent/types'
import { AcpMessageHandler } from './AcpMessageHandler'
import { deriveToolInputFromUpdate, hoistDiffContentIntoInput, normalizeAcpToolContent } from './acpToolContent'
import { ACP_SESSION_UPDATE_TYPES } from './constants'

describe('acp tool content helpers', () => {
    it('derives conservative inputs from Gemini kind/title/location fields', () => {
        expect(deriveToolInputFromUpdate({ kind: 'read', title: 'README.md' })).toEqual({ file_path: 'README.md' })
        expect(deriveToolInputFromUpdate({ kind: 'execute', title: 'ls -la' })).toEqual({ command: 'ls -la' })
        expect(deriveToolInputFromUpdate({ kind: 'search', title: '*.ts' })).toEqual({ pattern: '*.ts' })
        expect(
            deriveToolInputFromUpdate({ kind: 'edit', title: 'Writing file', locations: [{ path: 'src/a.ts' }] })
        ).toEqual({
            file_path: 'src/a.ts',
        })
        expect(deriveToolInputFromUpdate({ kind: 'think', title: 'Inspecting project' })).toBeNull()
    })

    it('hoists Gemini diff content into Claude-shaped write/edit input', () => {
        expect(
            hoistDiffContentIntoInput([{ type: 'diff', path: 'a.txt', newText: 'new', _meta: { kind: 'add' } }])
        ).toEqual({ name: 'Write', input: { file_path: 'a.txt', content: 'new' } })
        expect(
            hoistDiffContentIntoInput([
                { type: 'diff', path: 'a.txt', oldText: 'old', newText: 'new', _meta: { kind: 'modify' } },
            ])
        ).toEqual({ name: 'Edit', input: { file_path: 'a.txt', old_string: 'old', new_string: 'new' } })
    })

    it('normalizes ACP content arrays without hiding unknown shapes', () => {
        expect(normalizeAcpToolContent([{ type: 'content', content: { type: 'text', text: 'one' } }])).toBe('one')
        expect(
            normalizeAcpToolContent([
                { type: 'diff', path: 'a.txt', oldText: 'a', newText: 'b', _meta: { kind: 'modify' } },
            ])
        ).toEqual({
            path: 'a.txt',
            oldText: 'a',
            newText: 'b',
            kind: 'modify',
        })
        expect(normalizeAcpToolContent([{ type: 'content', content: { type: 'image' } }])).toBeNull()
    })
})

describe('AcpMessageHandler Gemini tool input projection', () => {
    it('emits derived input before result when rawInput is absent', () => {
        const messages: AgentMessage[] = []
        const handler = new AcpMessageHandler((message) => messages.push(message))

        handler.handleUpdate({
            sessionUpdate: ACP_SESSION_UPDATE_TYPES.toolCall,
            toolCallId: 'tool-read',
            kind: 'read',
            title: 'README.md',
            status: 'in_progress',
        })

        expect(messages).toContainEqual({
            type: 'tool_call',
            id: 'tool-read',
            name: 'README.md',
            input: { file_path: 'README.md' },
            status: 'in_progress',
        })
    })

    it('re-emits completed write tools with hoisted input and normalized result', () => {
        const messages: AgentMessage[] = []
        const handler = new AcpMessageHandler((message) => messages.push(message))

        handler.handleUpdate({
            sessionUpdate: ACP_SESSION_UPDATE_TYPES.toolCall,
            toolCallId: 'tool-write',
            kind: 'edit',
            title: 'Writing to a.txt',
            locations: [{ path: 'a.txt' }],
            status: 'in_progress',
        })
        handler.handleUpdate({
            sessionUpdate: ACP_SESSION_UPDATE_TYPES.toolCallUpdate,
            toolCallId: 'tool-write',
            kind: 'edit',
            status: 'completed',
            content: [{ type: 'diff', path: 'a.txt', newText: 'hello', _meta: { kind: 'add' } }],
        })

        expect(messages).toContainEqual({
            type: 'tool_call',
            id: 'tool-write',
            name: 'Write',
            input: { file_path: 'a.txt', content: 'hello' },
            status: 'completed',
        })
        expect(messages).toContainEqual({
            type: 'tool_result',
            id: 'tool-write',
            output: { path: 'a.txt', oldText: undefined, newText: 'hello', kind: 'add' },
            status: 'completed',
        })
    })
})
