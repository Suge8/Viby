import { lazy, Suspense } from 'react'

const LazyCommandOutputBlock = lazy(async () => {
    const module = await import('@/components/CommandOutputBlock')
    return { default: module.CommandOutputBlock }
})

function CommandOutputFallback(props: { text: string }): React.JSX.Element {
    return (
        <div className="w-full overflow-hidden rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--app-code-bg)]">
            <pre className="ds-command-output-fallback-body m-0 overflow-auto whitespace-pre-wrap break-words p-3 text-xs font-mono text-[var(--ds-text-secondary)]">
                {props.text}
            </pre>
        </div>
    )
}

export function CommandOutputMessageContent(props: { text: string }): React.JSX.Element {
    return (
        <Suspense fallback={<CommandOutputFallback text={props.text} />}>
            <LazyCommandOutputBlock text={props.text} />
        </Suspense>
    )
}
