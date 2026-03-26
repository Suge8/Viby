import { memo } from 'react'
import { cn } from '@/lib/utils'

type PlainTextContentProps = {
    text: string
    className?: string
}

function PlainTextContentComponent(props: PlainTextContentProps): React.JSX.Element {
    return (
        <div className={cn('whitespace-pre-wrap break-words text-base', props.className)}>
            {props.text}
        </div>
    )
}

export const PlainTextContent = memo(PlainTextContentComponent)
PlainTextContent.displayName = 'PlainTextContent'
