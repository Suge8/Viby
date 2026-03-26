import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { isObject } from '@viby/protocol'
import { TextContent } from '@/components/TextContent'

export function ExitPlanModeView(props: ToolViewProps) {
    const input = props.block.tool.input
    if (!isObject(input)) return null
    const plan = typeof input.plan === 'string' ? input.plan : null
    if (!plan) return null
    return <TextContent text={plan} mode="markdown" />
}
