import { lazy, Suspense, type JSX } from 'react'
import { NoticeProvider } from '@/lib/notice-center'

const LazyAppController = lazy(async () => {
    const module = await import('@/components/AppController')
    return { default: module.AppController }
})

function AppBootFallback(): JSX.Element {
    return <div className="h-full min-h-0 w-full bg-[var(--ds-canvas)]" />
}

export function App(): JSX.Element {
    return (
        <NoticeProvider>
            <Suspense fallback={<AppBootFallback />}>
                <LazyAppController />
            </Suspense>
        </NoticeProvider>
    )
}
