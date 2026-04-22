import { TextContent } from '@/components/TextContent'
import { ChecklistList, extractUpdatePlanData } from '@/components/ToolCard/checklist'
import type { ToolViewProps } from '@/components/ToolCard/views/_all'

export function UpdatePlanView(props: ToolViewProps): React.JSX.Element {
    const plan = extractUpdatePlanData(props.block.tool.input, props.block.tool.result)
    return (
        <div className="flex flex-col gap-3">
            {plan.explanation ? <TextContent text={plan.explanation} mode="markdown" /> : null}
            <ChecklistList items={plan.items} />
        </div>
    )
}
