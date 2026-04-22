import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import { runNavigationTransition } from '@/lib/navigationTransition'
import { resolveSessionsParentNavigation } from '@/routes/sessions/sessionRoutePaths'

export function useAppGoBack(): () => void {
    const navigate = useNavigate()
    const router = useRouter()
    const pathname = useLocation({ select: (location) => location.pathname })
    const search = useLocation({ select: (location) => location.search })

    return useCallback(() => {
        const parentNavigation = resolveSessionsParentNavigation({ pathname, search })
        if (parentNavigation) {
            runNavigationTransition(
                () => {
                    void navigate(parentNavigation)
                },
                { enableViewTransition: true }
            )
            return
        }

        // Fallback to history.back() for other cases
        router.history.back()
    }, [navigate, pathname, router, search])
}
