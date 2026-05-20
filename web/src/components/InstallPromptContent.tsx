import { home, starNorth, tabArrowUpRight, tabPlus } from '@lucide/lab'
import { type JSX, type Ref, useRef } from 'react'
import { FeatureCloseIcon as CloseIcon, FeatureShareIcon as ShareIcon } from '@/components/featureIcons'
import { INSTALL_ICON_TONES, InstallLabIcon, type InstallTone } from '@/components/InstallPromptIcons'
import { BrandMarkIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useModalFocusTrap } from '@/components/useModalFocusTrap'
import type { InstallPlatform } from '@/hooks/usePWAInstall'
import { cn } from '@/lib/utils'
import '@/styles/design-install.css'

type InstallBadgeTone = 'native' | 'shortcut'
type InstallPromptKind = Exclude<InstallPlatform, null>

export type InstallStepItem = {
    key: string
    title: string
    description: string
    tone: InstallTone
    icon: JSX.Element
}

export type InstallBannerModel = {
    badge: string
    platformLabel: string
    platformTone: InstallBadgeTone
    title: string
    description: string
    actionLabel: string
    dismissLabel: string
}

export type InstallGuideModel = {
    badge: string
    title: string
    description: string
    closeLabel: string
    dismissLabel: string
    steps: ReadonlyArray<InstallStepItem>
}

export type InstallPromptViewModel = {
    banner: InstallBannerModel
    guide: InstallGuideModel
}

function getInstallStepPrefix(kind: InstallPromptKind): string {
    if (kind === 'shortcut') return 'install.shortcutStep'
    if (kind === 'desktop-safari') return 'install.desktopSafariStep'
    return 'install.step'
}

function buildInstallSteps(
    t: (key: string, params?: Record<string, string | number>) => string,
    kind: InstallPromptKind
): InstallStepItem[] {
    const prefix = getInstallStepPrefix(kind)
    return [
        {
            key: 'share',
            title: t(`${prefix}.share.title`),
            description: t(`${prefix}.share.description`),
            tone: 'coral',
            icon: <ShareIcon className="h-4.5 w-4.5" strokeWidth={2.2} />,
        },
        {
            key: 'home',
            title: t(`${prefix}.addToHome.title`),
            description: t(`${prefix}.addToHome.description`),
            tone: 'gold',
            icon: <InstallLabIcon iconNode={tabPlus} tone="gold" iconClassName="h-4.5 w-4.5" compact />,
        },
        {
            key: 'confirm',
            title: t(`${prefix}.confirm.title`),
            description: t(`${prefix}.confirm.description`),
            tone: 'violet',
            icon: <InstallLabIcon iconNode={tabArrowUpRight} tone="violet" iconClassName="h-4.5 w-4.5" compact />,
        },
    ]
}

export function createInstallPromptViewModel(
    t: (key: string, params?: Record<string, string | number>) => string,
    kind: InstallPromptKind
): InstallPromptViewModel {
    const isShortcut = kind === 'shortcut'
    const descriptionKey = `install.description.${kind}`
    const title = t(isShortcut ? 'install.title.shortcut' : 'install.title')

    return {
        banner: {
            badge: t('install.badge'),
            platformLabel: t(`install.platform.${kind}`),
            platformTone: isShortcut ? 'shortcut' : 'native',
            title,
            description: t(descriptionKey),
            actionLabel: kind === 'native' ? t('install.action.install') : t('install.action.showSteps'),
            dismissLabel: t('button.dismiss'),
        },
        guide: {
            badge: t('install.badge'),
            title,
            description: t(descriptionKey),
            closeLabel: t('button.close'),
            dismissLabel: t('button.dismiss'),
            steps: buildInstallSteps(t, kind),
        },
    }
}

export function InstallBanner(props: {
    model: InstallBannerModel
    primaryActionRef?: Ref<HTMLButtonElement>
    onPrimaryAction: () => unknown
    onDismiss: () => void
}): JSX.Element {
    return (
        <div className="ds-install-banner-frame animate-slide-up">
            <div className="ds-panel ds-install-banner-surface">
                <div className="ds-install-banner-glow" aria-hidden="true" />
                <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                        <InstallLabIcon iconNode={home} tone="coral" iconClassName="h-5.5 w-5.5" />
                        <span className="ds-install-brand-badge absolute -right-1.5 -top-1.5">
                            <BrandMarkIcon className="h-3.5 w-3.5" />
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="ds-install-badge">{props.model.badge}</span>
                            <span
                                className={cn(
                                    'ds-install-platform-badge',
                                    props.model.platformTone === 'shortcut' && 'ds-install-platform-badge-warning'
                                )}
                            >
                                {props.model.platformLabel}
                            </span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[var(--app-fg)]">{props.model.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-hint)]">{props.model.description}</p>
                        <div className="mt-4 flex items-center gap-2">
                            <Button
                                ref={props.primaryActionRef}
                                size="sm"
                                className="ds-install-action-button"
                                onClick={props.onPrimaryAction}
                            >
                                {props.model.actionLabel}
                            </Button>
                            <Button
                                size="iconSm"
                                variant="outline"
                                className="ds-install-dismiss-button"
                                onClick={props.onDismiss}
                                aria-label={props.model.dismissLabel}
                                data-testid="install-banner-dismiss"
                            >
                                <CloseIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function InstallGuideDialog(props: {
    model: InstallGuideModel
    onClose: () => void
    onDismiss: () => void
}): JSX.Element {
    const sheetRef = useRef<HTMLDivElement | null>(null)
    useModalFocusTrap(sheetRef, props.onClose)

    return (
        <div className="ds-install-guide-backdrop animate-install-fade" role="presentation" onClick={props.onClose}>
            <div
                ref={sheetRef}
                className="ds-dialog-surface ds-install-guide-sheet space-y-5 animate-slide-up"
                role="dialog"
                aria-modal="true"
                aria-labelledby="install-guide-title"
                tabIndex={-1}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="ds-install-badge">{props.model.badge}</div>
                        <div className="mt-4 flex items-center gap-3">
                            <InstallLabIcon iconNode={starNorth} tone="coral" iconClassName="h-5.5 w-5.5" />
                            <div>
                                <h3 id="install-guide-title" className="text-lg font-semibold text-[var(--app-fg)]">
                                    {props.model.title}
                                </h3>
                                <p className="mt-1 text-sm leading-6 text-[var(--app-hint)]">
                                    {props.model.description}
                                </p>
                            </div>
                        </div>
                    </div>
                    <Button
                        type="button"
                        size="iconSm"
                        variant="ghost"
                        onClick={props.onClose}
                        className="ds-install-close-button active:opacity-60"
                        aria-label={props.model.closeLabel}
                        data-testid="install-guide-close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </Button>
                </div>

                <div className="space-y-3">
                    {props.model.steps.map((step, index) => (
                        <InstallStepCard
                            key={step.key}
                            index={index + 1}
                            title={step.title}
                            description={step.description}
                            tone={step.tone}
                            icon={step.icon}
                        />
                    ))}
                </div>

                <Button
                    variant="outline"
                    className="ds-install-guide-dismiss-button w-full"
                    onClick={props.onDismiss}
                    data-testid="install-guide-dismiss"
                >
                    {props.model.dismissLabel}
                </Button>
            </div>
        </div>
    )
}

function InstallStepCard(props: {
    index: number
    title: string
    description: string
    tone: InstallTone
    icon: JSX.Element
}): JSX.Element {
    return (
        <div className="ds-install-step-card">
            <div className="flex items-start gap-3">
                <div className="ds-install-step-index" style={INSTALL_ICON_TONES[props.tone]}>
                    {props.index}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                        <span className="ds-install-step-icon">{props.icon}</span>
                        <div>
                            <p className="text-sm font-semibold text-[var(--app-fg)]">{props.title}</p>
                            <p className="mt-1 text-sm leading-6 text-[var(--app-hint)]">{props.description}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
