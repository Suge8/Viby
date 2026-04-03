import { resolveSessionDriver } from '@viby/protocol'
import { Suspense, lazy, useId, useMemo, useRef, useState } from 'react'
import type { Session } from '@/types/api'
import { BackIcon, MoreIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
    DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT,
    type FloatingActionMenuAnchorPoint
} from '@/components/ui/FloatingActionMenu.contract'
import {
    getSessionAgentLabel,
    SessionAgentBrandIcon
} from '@/components/session-list/sessionAgentPresentation'
import { getSessionModelLabel } from '@/lib/sessionModelLabel'
import { getSessionTitle } from '@/lib/sessionPresentation'
import { useTranslation } from '@/lib/use-translation'

type SessionHeaderNavigation = {
    onBack: () => void
    onViewFiles?: () => void
    onViewTerminal?: () => void
}

type SessionHeaderProps = {
    session: Session
    navigation: SessionHeaderNavigation
}

async function loadSessionHeaderActionMenuModule() {
    return import('@/components/SessionHeaderActionMenu')
}

const LazySessionHeaderActionMenu = lazy(loadSessionHeaderActionMenuModule)

const HEADER_SHELL_CLASS_NAME = '[--chat-header-side-width:5rem] sm:[--chat-header-side-width:5.5rem] mx-auto w-full ds-stage-shell px-3'
const HEADER_GRID_CLASS_NAME = 'grid grid-cols-[var(--chat-header-side-width)_minmax(0,1fr)_var(--chat-header-side-width)] items-center gap-2'
const HEADER_ROOT_CLASS_NAME = `${HEADER_SHELL_CLASS_NAME} ${HEADER_GRID_CLASS_NAME} pb-1.5 pt-1.5 sm:pb-2 sm:pt-2`
const HEADER_ACTION_BUTTON_CLASS_NAME = 'h-9 w-9 shrink-0 rounded-[var(--ds-radius-lg)] text-[var(--app-hint)] hover:text-[var(--app-fg)] sm:h-10 sm:w-10'
const HEADER_PANEL_CLASS_NAME = 'min-w-0 rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-3 py-2 sm:px-4 sm:py-2.5'
const HEADER_METADATA_ROW_CLASS_NAME = 'mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] leading-relaxed text-[var(--app-hint)] sm:mt-1.5 sm:gap-2 sm:text-xs'

export function SessionHeader(props: SessionHeaderProps): React.JSX.Element {
    const { t } = useTranslation()
    const { session, navigation } = props
    const title = useMemo(() => getSessionTitle(session), [session])
    const worktreeBranch = session.metadata?.worktree?.branch
    const sessionDriver = resolveSessionDriver(session.metadata)
    const modelLabel = getSessionModelLabel(session)
    const agentLabel = getSessionAgentLabel(sessionDriver)
    const hasMenuActions = Boolean(navigation.onViewFiles || navigation.onViewTerminal)
    const [menuOpen, setMenuOpen] = useState(false)
    const [menuAnchorPoint, setMenuAnchorPoint] = useState<FloatingActionMenuAnchorPoint>(
        DEFAULT_FLOATING_ACTION_MENU_ANCHOR_POINT
    )
    const menuId = useId()
    const menuAnchorRef = useRef<HTMLButtonElement | null>(null)

    function handleMenuToggle(): void {
        if (!hasMenuActions) {
            return
        }

        if (!menuOpen) {
            void loadSessionHeaderActionMenuModule()

            if (menuAnchorRef.current) {
                const rect = menuAnchorRef.current.getBoundingClientRect()
                setMenuAnchorPoint({ x: rect.right, y: rect.bottom })
            }
        }

        setMenuOpen((open) => !open)
    }

    return (
        <>
            <div className="session-chat-header-shell shrink-0 bg-[var(--app-bg)] pt-[max(env(safe-area-inset-top),0.125rem)]">
                <div className={HEADER_ROOT_CLASS_NAME}>
                    <div className="flex min-w-0 justify-start">
                        <Button
                            type="button"
                            size="iconSm"
                            variant="secondary"
                            onClick={navigation.onBack}
                            className={HEADER_ACTION_BUTTON_CLASS_NAME}
                        >
                            <BackIcon className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className={HEADER_PANEL_CLASS_NAME} data-testid="session-header-panel">
                        <div className="truncate text-center text-sm font-semibold leading-tight sm:text-base">
                            {title}
                        </div>
                        <div className={HEADER_METADATA_ROW_CLASS_NAME}>
                            <span className="inline-flex items-center gap-1">
                                <SessionAgentBrandIcon
                                    driver={sessionDriver}
                                    className="h-3.5 w-3.5"
                                />
                                {agentLabel}
                            </span>
                            {modelLabel ? (
                                <span>
                                    {t(modelLabel.key)}: {modelLabel.value}
                                </span>
                            ) : null}
                            {worktreeBranch ? (
                                <span>{t('session.item.worktree')}: {worktreeBranch}</span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex min-w-0 justify-end gap-1.5 sm:gap-2">
                        {hasMenuActions ? (
                            <Button
                                type="button"
                                size="iconSm"
                                variant="secondary"
                                onClick={handleMenuToggle}
                                onPointerDown={(event) => event.stopPropagation()}
                                ref={menuAnchorRef}
                                aria-haspopup="menu"
                                aria-expanded={menuOpen}
                                aria-controls={menuOpen ? menuId : undefined}
                                className={HEADER_ACTION_BUTTON_CLASS_NAME}
                                title={t('session.more')}
                            >
                                <MoreIcon className="h-5 w-5" />
                            </Button>
                        ) : null}
                    </div>
                </div>
            </div>

            {hasMenuActions && menuOpen ? (
                <Suspense fallback={null}>
                    <LazySessionHeaderActionMenu
                        isOpen={menuOpen}
                        onClose={() => setMenuOpen(false)}
                        anchorPoint={menuAnchorPoint}
                        menuId={menuId}
                        navigation={navigation}
                    />
                </Suspense>
            ) : null}
        </>
    )
}
