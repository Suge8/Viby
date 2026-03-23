import { lazy, Suspense } from 'react'

const LazyCliOutputBlock = lazy(async () => {
    const module = await import('@/components/CliOutputBlock')
    return { default: module.CliOutputBlock }
})

function CliOutputFallback(props: { text: string }): React.JSX.Element {
    return (
        <div className="w-full overflow-hidden rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--app-code-bg)]">
            <pre className="m-0 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words p-3 text-xs font-mono text-[var(--ds-text-secondary)]">
                {props.text}
            </pre>
        </div>
    )
}

export function CliOutputMessageContent(props: { text: string }): React.JSX.Element {
    return (
        <Suspense fallback={<CliOutputFallback text={props.text} />}>
            <LazyCliOutputBlock text={props.text} />
        </Suspense>
    )
}
