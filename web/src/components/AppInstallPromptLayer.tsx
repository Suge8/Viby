import { type ComponentProps, type JSX, lazy, Suspense } from 'react'

async function loadInstallPromptModule(): Promise<{
    default: (props: ComponentProps<typeof import('@/components/InstallPrompt').InstallPrompt>) => JSX.Element | null
}> {
    const module = await import('@/components/InstallPrompt')
    return { default: module.InstallPrompt }
}

const LazyInstallPrompt = lazy(loadInstallPromptModule)

type AppInstallPromptLayerProps = {
    suppressed?: boolean
}

export function AppInstallPromptLayer({ suppressed = false }: AppInstallPromptLayerProps): JSX.Element {
    return (
        <Suspense fallback={null}>
            <LazyInstallPrompt suppressed={suppressed} />
        </Suspense>
    )
}
