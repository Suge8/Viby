import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { NewSession } from '@/components/NewSession'
import { BrandMarkIcon } from '@/components/icons'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useMachines } from '@/hooks/queries/useMachines'
import { useAppContext } from '@/lib/app-context'
import {
    runNavigationTransition,
    runPreloadedNavigation,
    VIEW_TRANSITION_NAVIGATION_OPTIONS,
} from '@/lib/navigationTransition'
import { getNoticePreset } from '@/lib/noticePresets'
import { queryKeys } from '@/lib/query-keys'
import { useTranslation } from '@/lib/use-translation'
import { SessionRouteBanner } from '@/routes/sessions/components/SessionRouteBanner'
import { preloadSessionDetailRoute } from '@/routes/sessions/sessionDetailRoutePreload'

export default function NewSessionRoute() {
    const { api } = useAppContext()
    useFinalizeBootShell()
    const navigate = useNavigate()
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const { machines, isLoading: machinesLoading, error: machinesError } = useMachines(api, true)
    const { t } = useTranslation()
    const loadMachinesErrorPreset = getNoticePreset('newSessionLoadMachinesError', t)

    const handleCancel = useCallback(() => {
        runNavigationTransition(() => {
            void navigate({ to: '/sessions' })
        }, VIEW_TRANSITION_NAVIGATION_OPTIONS)
    }, [navigate])

    const handleSuccess = useCallback((sessionId: string) => {
        const recoveryHref = `/sessions/${sessionId}`
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        runPreloadedNavigation(
            () => preloadSessionDetailRoute({
                api,
                queryClient,
                sessionId
            }),
            () => {
                void navigate({
                    to: '/sessions/$sessionId',
                    params: { sessionId },
                    replace: true
                })
            },
            recoveryHref
        )
    }, [api, navigate, queryClient])

    return (
        <div className="h-full overflow-y-auto">
            <div className="ds-stage-shell flex min-h-full flex-col px-3 pb-8">
                <SurfaceRouteHeader
                    title={t('newSession.title')}
                    onBack={goBack}
                    eyebrow="Viby"
                    titleIcon={<BrandMarkIcon className="h-5.5 w-5.5 text-[var(--ds-text-primary)]" />}
                />

                {machinesError ? (
                    <SessionRouteBanner
                        tone="error"
                        title={loadMachinesErrorPreset.title}
                        description={machinesError}
                    />
                ) : null}

                <NewSession
                    api={api}
                    machines={machines}
                    isLoading={machinesLoading}
                    onCancel={handleCancel}
                    onSuccess={handleSuccess}
                />
            </div>
        </div>
    )
}
