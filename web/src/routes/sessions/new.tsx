import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useRef } from 'react'
import { BrandMarkIcon } from '@/components/icons'
import { LoadingState } from '@/components/LoadingState'
import { NewSession } from '@/components/NewSession'
import { STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME, StageBrandMark } from '@/components/StageBrandMark'
import { SurfaceRouteHeader } from '@/components/SurfaceRouteHeader'
import { useRuntime } from '@/hooks/queries/useRuntime'
import { useAppGoBack } from '@/hooks/useAppGoBack'
import { useFinalizeBootShell } from '@/hooks/useFinalizeBootShell'
import { useAppContext } from '@/lib/app-context'
import {
    runNavigationTransition,
    runPreloadedNavigation,
    VIEW_TRANSITION_NAVIGATION_OPTIONS,
} from '@/lib/navigationTransition'
import { getNoticePreset } from '@/lib/noticePresets'
import { queryKeys } from '@/lib/query-keys'
import {
    getRuntimeAvailabilityCopy,
    getRuntimeAvailabilityPresentation,
    type RuntimeAvailabilityCopy,
    type RuntimeAvailabilityPresentation,
} from '@/lib/runtimeAvailabilityPresentation'
import { useTranslation } from '@/lib/use-translation'
import { SessionRoutePageSurface } from '@/routes/sessions/components/SessionRoutePageSurface'
import {
    preloadSessionDetailCriticalRoute,
    warmSessionDetailAncillaryRouteData,
} from '@/routes/sessions/sessionDetailRoutePreload'
import { buildSessionHref, NEW_SESSION_ROUTE, SESSIONS_INDEX_ROUTE } from '@/routes/sessions/sessionRoutePaths'
import { buildSessionDetailReadyPreloadOptions } from '@/routes/sessions/sessionsShellSupport'
import type { LocalRuntime } from '@/types/api'

const NEW_SESSION_BLOCKED_BRAND_MARK_CLASS_NAME = `h-24 w-24 ${STAGE_BRAND_MARK_NEUTRAL_TONE_CLASS_NAME}`

type NewSessionBlockedStateProps = {
    title: string
    description: string
    detail?: string | null
}

type RuntimeRefreshOptions = {
    runtime: LocalRuntime | null
    runtimeLoading: boolean
    refetchRuntime: () => Promise<unknown>
}

type NewSessionRouteContentProps = {
    api: ReturnType<typeof useAppContext>['api']
    handleCancel: () => void
    handleSuccess: (sessionId: string) => void
    runtime: LocalRuntime | null
    runtimeAvailability: RuntimeAvailabilityPresentation
    runtimeAvailabilityCopy: RuntimeAvailabilityCopy | null
    searchMode: string | undefined
    t: ReturnType<typeof useTranslation>['t']
}

function NewSessionBlockedState(props: NewSessionBlockedStateProps): React.JSX.Element {
    return (
        <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
                <StageBrandMark className={NEW_SESSION_BLOCKED_BRAND_MARK_CLASS_NAME} />
                <div className="mt-6 space-y-3">
                    <h2 className="font-semibold text-[var(--ds-text-primary)]">{props.title}</h2>
                    <p className="text-sm leading-7 text-[var(--ds-text-secondary)]">{props.description}</p>
                    {props.detail ? (
                        <p className="text-sm leading-6 text-[var(--ds-text-muted)]">{props.detail}</p>
                    ) : null}
                </div>
            </div>
        </div>
    )
}

function useCachedRuntimeBackgroundRefresh(options: RuntimeRefreshOptions): void {
    const didRequestBackgroundRuntimeRefreshRef = useRef(false)
    const { refetchRuntime, runtime, runtimeLoading } = options

    useEffect(() => {
        if (didRequestBackgroundRuntimeRefreshRef.current || runtimeLoading || runtime === null) {
            return
        }

        didRequestBackgroundRuntimeRefreshRef.current = true
        void refetchRuntime()
    }, [refetchRuntime, runtime, runtimeLoading])
}

function renderNewSessionRouteContent(props: NewSessionRouteContentProps): React.JSX.Element | null {
    if (props.runtimeAvailability.kind === 'loading') {
        return (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
                <LoadingState
                    variant="panel"
                    label={props.t('loading.runtime')}
                    description={props.t('runtime.unavailable.loadingMessage')}
                    className="py-4"
                />
            </div>
        )
    }

    if (props.runtimeAvailabilityCopy) {
        return (
            <NewSessionBlockedState
                title={props.runtimeAvailabilityCopy.blockedTitle}
                description={props.runtimeAvailabilityCopy.blockedDescription}
                detail={props.runtimeAvailabilityCopy.blockedDetail}
            />
        )
    }

    if (props.runtimeAvailability.kind !== 'ready' || !props.runtime) {
        return null
    }

    return (
        <NewSession
            api={props.api}
            runtime={props.runtime}
            initialMode={props.searchMode === 'recover-local' ? 'recover-local' : 'start'}
            onCancel={props.handleCancel}
            onSuccess={props.handleSuccess}
        />
    )
}

export default function NewSessionRoute(): React.JSX.Element {
    const { api } = useAppContext()
    useFinalizeBootShell()
    const navigate = useNavigate()
    const search = useSearch({ from: NEW_SESSION_ROUTE })
    const goBack = useAppGoBack()
    const queryClient = useQueryClient()
    const {
        runtime,
        isLoading: runtimeLoading,
        isFetching: runtimeFetching,
        error: runtimeError,
        refetch: refetchRuntime,
    } = useRuntime(api, true)
    const { t } = useTranslation()
    const loadRuntimeErrorPreset = getNoticePreset('newSessionLoadRuntimeError', t)
    const runtimeAvailability = getRuntimeAvailabilityPresentation({
        runtime,
        isLoading: runtimeLoading || (runtimeFetching && !runtime?.active),
        error: runtimeError,
        t,
    })
    const runtimeAvailabilityCopy = getRuntimeAvailabilityCopy(runtimeAvailability, {
        loadRuntimeErrorTitle: loadRuntimeErrorPreset.title,
        t,
    })

    useCachedRuntimeBackgroundRefresh({
        runtime,
        runtimeLoading,
        refetchRuntime,
    })

    const handleCancel = useCallback(() => {
        runNavigationTransition(() => {
            void navigate({ to: SESSIONS_INDEX_ROUTE })
        }, VIEW_TRANSITION_NAVIGATION_OPTIONS)
    }, [navigate])

    const handleSuccess = useCallback(
        (sessionId: string) => {
            const recoveryHref = buildSessionHref(sessionId)
            const preloadOptions = buildSessionDetailReadyPreloadOptions({
                api,
                queryClient,
                sessionId,
            })
            void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
            warmSessionDetailAncillaryRouteData(preloadOptions)
            runPreloadedNavigation(
                () => preloadSessionDetailCriticalRoute(preloadOptions),
                () => {
                    void navigate({
                        to: '/sessions/$sessionId',
                        params: { sessionId },
                        replace: true,
                    })
                },
                recoveryHref
            )
        },
        [api, navigate, queryClient]
    )

    return (
        <SessionRoutePageSurface className="overflow-y-auto">
            <div className="ds-stage-shell flex min-h-full flex-col px-3 pb-8">
                <SurfaceRouteHeader
                    title={t('newSession.title')}
                    onBack={goBack}
                    eyebrow="Viby"
                    titleIcon={<BrandMarkIcon className="h-5.5 w-5.5 text-[var(--ds-text-primary)]" />}
                />
                {renderNewSessionRouteContent({
                    api,
                    handleCancel,
                    handleSuccess,
                    runtime,
                    runtimeAvailability,
                    runtimeAvailabilityCopy,
                    searchMode: search.mode,
                    t,
                })}
            </div>
        </SessionRoutePageSurface>
    )
}
