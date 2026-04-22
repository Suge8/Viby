import { describe, expect, it, vi } from 'vitest'
import type { ApiSessionClient } from '../api/apiSession.js'
import { TitleManager } from './titleManager.js'

describe('TitleManager', () => {
    function getFirstSummaryCall(sendClaudeSessionMessage: ReturnType<typeof vi.fn>): Record<string, unknown> {
        return sendClaudeSessionMessage.mock.calls.at(0)?.[0] as Record<string, unknown>
    }

    describe('generateTitle', () => {
        it('保持短消息原样', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('测试消息')).toBe('测试消息')
        })

        it('正确截断长消息', () => {
            const manager = new TitleManager()
            const longMessage =
                '这是一条非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的消息啊'
            const result = manager.generateTitle(longMessage)
            expect(result).toBe(
                '这是一条非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长...'
            )
            expect(result.length).toBe(50)
        })

        it('移除 "请" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('请帮我写代码')).toBe('帮我写代码')
        })

        it('移除 "帮我" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('帮我修复 bug')).toBe('修复 bug')
        })

        it('移除 "帮忙" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('帮忙看看这个问题')).toBe('看看这个问题')
        })

        it('移除 "能否" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('能否优化性能')).toBe('优化性能')
        })

        it('移除 "可以" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('可以解释一下吗')).toBe('解释一下吗')
        })

        it('移除 "麻烦" 前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('麻烦检查代码')).toBe('检查代码')
        })

        it('无前缀消息保持原样', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('实现登录功能')).toBe('实现登录功能')
        })

        it('正确处理空白字符', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('  请  帮我写代码  ')).toBe('帮我写代码')
        })

        it('会折叠多行和多余空白', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('请\n\n帮我   修复   登录  问题')).toBe('帮我 修复 登录 问题')
        })

        it('仅移除第一个匹配的前缀', () => {
            const manager = new TitleManager()
            expect(manager.generateTitle('请帮我请求 API')).toBe('帮我请求 API')
        })
    })

    describe('handleMessage', () => {
        it('首条消息触发标题更新', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '测试消息')

            expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(1)
            const call = getFirstSummaryCall(sendClaudeSessionMessage)
            expect(call).toMatchObject({
                type: 'summary',
                summary: '测试消息',
            })
            expect(call).toHaveProperty('leafUuid')
        })

        it('第二条消息不触发标题更新', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '第一条消息')
            manager.handleMessage(mockClient, '第二条消息')

            expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(1)
        })

        it('第三条消息不触发标题更新', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '第一条消息')
            manager.handleMessage(mockClient, '第二条消息')
            manager.handleMessage(mockClient, '第三条消息')

            expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(1)
        })

        it('标题生成逻辑正确应用', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '请帮我写代码')

            const call = getFirstSummaryCall(sendClaudeSessionMessage)
            expect(call.summary).toBe('帮我写代码')
        })

        it('消息格式包含必需字段', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '测试')

            const call = getFirstSummaryCall(sendClaudeSessionMessage)
            expect(call).toHaveProperty('type', 'summary')
            expect(call).toHaveProperty('summary')
            expect(call).toHaveProperty('leafUuid')
            expect(typeof call.leafUuid).toBe('string')
        })

        it('空白首条消息不会抢占后续真实标题', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '   ')
            manager.handleMessage(mockClient, '修复登录回归')

            expect(sendClaudeSessionMessage).toHaveBeenCalledTimes(1)
            expect(getFirstSummaryCall(sendClaudeSessionMessage)).toMatchObject({
                type: 'summary',
                summary: '修复登录回归',
            })
        })

        it('已有 summary 时不会重复更新标题', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => ({
                    summary: {
                        text: 'Existing title',
                        updatedAt: 1,
                    },
                }),
                getObservedAutoSummarySnapshot: () => null,
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '新的首条消息')

            expect(sendClaudeSessionMessage).not.toHaveBeenCalled()
        })

        it('已有 observed auto summary 时不会重复更新标题', () => {
            const manager = new TitleManager()
            const sendClaudeSessionMessage = vi.fn()
            const mockClient = {
                sendClaudeSessionMessage,
                getMetadataSnapshot: () => null,
                getObservedAutoSummarySnapshot: () => ({
                    text: 'Recovered title',
                    updatedAt: 1,
                }),
            } as unknown as ApiSessionClient

            manager.handleMessage(mockClient, '新的首条消息')

            expect(sendClaudeSessionMessage).not.toHaveBeenCalled()
        })
    })
})
