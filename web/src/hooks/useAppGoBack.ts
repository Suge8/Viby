import { useCallback } from 'react'
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { runNavigationTransition } from '@/lib/navigationTransition'

export function useAppGoBack(): () => void {
    const navigate = useNavigate()
    const router = useRouter()
    const pathname = useLocation({ select: (location) => location.pathname })
    const search = useLocation({ select: (location) => location.search })

    return useCallback(() => {
        // Use explicit path navigation for consistent behavior across all environments
        if (pathname === '/sessions/new') {
            runNavigationTransition(() => {
                void navigate({ to: '/sessions' })
            }, { enableViewTransition: true })
            return
        }

        // Settings page always goes back to sessions
        if (pathname === '/settings') {
            runNavigationTransition(() => {
                void navigate({ to: '/sessions' })
            }, { enableViewTransition: true })
            return
        }

        // For single file view, go back to files list
        if (pathname.match(/^\/sessions\/[^/]+\/file$/)) {
            const filesPath = pathname.replace(/\/file$/, '/files')

            const tab = (search && typeof search === 'object' && 'tab' in search)
                ? (search as { tab?: unknown }).tab
                : undefined
            const nextSearch = tab === 'directories' ? { tab: 'directories' as const } : {}

            runNavigationTransition(() => {
                void navigate({ to: filesPath, search: nextSearch })
            }, { enableViewTransition: true })
            return
        }

        // For session routes, navigate to parent path
        if (pathname.startsWith('/sessions/')) {
            const parentPath = pathname.replace(/\/[^/]+$/, '') || '/sessions'
            runNavigationTransition(() => {
                void navigate({ to: parentPath })
            }, { enableViewTransition: true })
            return
        }

        // Fallback to history.back() for other cases
        router.history.back()
    }, [navigate, pathname, router, search])
}
