import { ToolMarkdownButtonOptionContent } from '@/components/ToolCard/markdownContent'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ToolQuestionOptionMode = 'single' | 'multi'

function SelectionMark(props: { checked: boolean; mode: ToolQuestionOptionMode }) {
    const mark = props.mode === 'multi' ? (props.checked ? '☑' : '☐') : props.checked ? '●' : '○'
    return <span className="mt-0.5 w-4 shrink-0 text-center text-[var(--app-hint)]">{mark}</span>
}

export function ToolQuestionOptionRow(props: {
    checked: boolean
    disabled: boolean
    title: string
    description?: string | null
    mode?: ToolQuestionOptionMode
    onClick: () => void
}) {
    const mode = props.mode ?? 'single'

    return (
        <Button
            type="button"
            variant={props.checked ? 'secondary' : 'plain'}
            size="sm"
            className={cn(
                'w-full gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--app-subtle-bg)] disabled:pointer-events-none disabled:opacity-50 [&>[data-button-content]]:w-full [&>[data-button-content]]:items-start [&>[data-button-content]]:justify-start',
                props.checked ? 'bg-[var(--app-subtle-bg)]' : null
            )}
            disabled={props.disabled}
            onClick={props.onClick}
        >
            <SelectionMark checked={props.checked} mode={mode} />
            <ToolMarkdownButtonOptionContent title={props.title} description={props.description} />
        </Button>
    )
}
