import type { SessionModelReasoningEffort } from '@/api/types'

export type PiSdkSession = Awaited<
    ReturnType<typeof import('@mariozechner/pi-coding-agent')['createAgentSession']>
>['session']
export type PiSdkSessionEvent = Parameters<PiSdkSession['subscribe']>[0] extends (event: infer TEvent) => void
    ? TEvent
    : never
export type PiSdkModel = NonNullable<PiSdkSession['model']>
export type PiSdkSessionManager = ReturnType<
    typeof import('@mariozechner/pi-coding-agent')['SessionManager']['inMemory']
>
export type PiBeforeToolCallHook = NonNullable<Parameters<PiSdkSession['agent']['setBeforeToolCall']>[0]>
export type PiBeforeToolCallContext = Parameters<PiBeforeToolCallHook>[0]
export type PiBeforeToolCallResult = Awaited<ReturnType<PiBeforeToolCallHook>>

export function isConfiguredPiReasoningEffort(value: unknown): value is Exclude<SessionModelReasoningEffort, null> {
    return typeof value === 'string'
}
