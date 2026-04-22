import { LoadingState } from '@/components/LoadingState'
import { useTranslation } from '@/lib/use-translation'
import { getLoadingStatePresentation, type LoadingStateKind } from './loadingStatePresentation'

type RouteLoadingFallbackProps = {
    kind?: LoadingStateKind
    withDescription?: boolean
    variant?: 'panel' | 'inline'
    testId?: string
}

export function RouteLoadingFallback(props: RouteLoadingFallbackProps): React.JSX.Element {
    const { t } = useTranslation()
    const presentation = getLoadingStatePresentation({
        kind: props.kind ?? 'workspace',
        t,
        withDescription: props.withDescription ?? false,
    })

    const variant = props.variant ?? 'panel'

    return (
        <div className="flex h-full items-center justify-center p-4" data-testid={props.testId}>
            <LoadingState
                label={presentation.label}
                description={presentation.description}
                icon={presentation.icon}
                variant={variant}
                className={variant === 'inline' ? 'text-sm' : undefined}
            />
        </div>
    )
}
