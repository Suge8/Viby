import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import React, { lazy, Suspense } from 'react'
import { AppMotionProvider } from '@/components/motion/motionPrimitives'
import { I18nProvider } from './lib/i18n-context'
import { queryClient } from './lib/query-client'
import { createAppRouter } from './router'

const DevOnlyReactQueryDevtools = import.meta.env.DEV
    ? lazy(async () => {
          const module = await import('@tanstack/react-query-devtools')
          return { default: module.ReactQueryDevtools }
      })
    : null

export function createAppElement(): React.JSX.Element {
    const router = createAppRouter()

    return (
        <React.StrictMode>
            <I18nProvider>
                <AppMotionProvider>
                    <QueryClientProvider client={queryClient}>
                        <RouterProvider router={router} />
                        {DevOnlyReactQueryDevtools ? (
                            <Suspense fallback={null}>
                                <DevOnlyReactQueryDevtools initialIsOpen={false} />
                            </Suspense>
                        ) : null}
                    </QueryClientProvider>
                </AppMotionProvider>
            </I18nProvider>
        </React.StrictMode>
    )
}
