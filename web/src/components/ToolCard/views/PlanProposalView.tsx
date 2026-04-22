import { isObject } from '@viby/protocol'
import { TextContent } from '@/components/TextContent'
import type { ToolViewProps } from '@/components/ToolCard/views/_all'

export function PlanProposalView(props: ToolViewProps): React.JSX.Element | null {
    const input = props.block.tool.input
    if (!isObject(input)) {
        return null
    }

    const plan = typeof input.plan === 'string' ? input.plan : null
    if (!plan) {
        return null
    }

    return <TextContent text={plan} mode="markdown" />
}
