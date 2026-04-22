import { home, starNorth, tabArrowUpRight, tabPlus } from '@lucide/lab'
import { Icon } from 'lucide-react'
import { type CSSProperties, type JSX } from 'react'
import { FeatureCloseIcon as CloseIcon, FeatureShareIcon as ShareIcon } from '@/components/featureIcons'
import { BrandMarkIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import '@/styles/design-install.css'

type LabIconNode = ReadonlyArray<readonly [string, Record<string, string>]>
type InstallTone = 'coral' | 'gold' | 'violet'

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

const INSTALL_ICON_TONES: Record<InstallTone, CSSProperties> = {
    coral: {
        color: 'var(--ds-accent-coral)',
        background: 'color-mix(in srgb, var(--ds-accent-coral) 16%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-coral) 28%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-coral) 18%, transparent)',
    },
    gold: {
        color: 'var(--ds-accent-gold)',
        background: 'color-mix(in srgb, var(--ds-accent-gold) 18%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-gold) 32%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-gold) 16%, transparent)',
    },
    violet: {
        color: 'var(--ds-accent-violet)',
        background: 'color-mix(in srgb, var(--ds-accent-violet) 16%, var(--ds-panel-strong))',
        borderColor: 'color-mix(in srgb, var(--ds-accent-violet) 28%, transparent)',
        boxShadow: '0 14px 32px color-mix(in srgb, var(--ds-accent-violet) 16%, transparent)',
    },
}

export function createInstallPromptViewModel(
    t: (key: string, params?: Record<string, string | number>) => string,
    isIOSGuide: boolean
): InstallPromptViewModel {
    const description = isIOSGuide ? t('install.description.ios') : t('install.description.native')
    const actionLabel = isIOSGuide ? t('install.action.showSteps') : t('install.action.install')
    const platformLabel = isIOSGuide ? t('install.platform.ios') : t('install.platform.native')

    return {
        banner: {
            badge: t('install.badge'),
            platformLabel,
            title: t('install.title'),
            description,
            actionLabel,
            dismissLabel: t('button.dismiss'),
        },
        guide: {
            badge: t('install.badge'),
            title: t('install.title'),
            description,
            closeLabel: t('button.close'),
            dismissLabel: t('button.dismiss'),
            steps: [
                {
                    key: 'share',
                    title: t('install.step.share.title'),
                    description: t('install.step.share.description'),
                    tone: 'coral',
                    icon: <ShareIcon className="h-4.5 w-4.5" strokeWidth={2.2} />,
                },
                {
                    key: 'home',
                    title: t('install.step.addToHome.title'),
                    description: t('install.step.addToHome.description'),
                    tone: 'gold',
                    icon: <InstallLabIcon iconNode={tabPlus} tone="gold" iconClassName="h-4.5 w-4.5" compact />,
                },
                {
                    key: 'confirm',
                    title: t('install.step.confirm.title'),
                    description: t('install.step.confirm.description'),
                    tone: 'violet',
                    icon: (
                        <InstallLabIcon iconNode={tabArrowUpRight} tone="violet" iconClassName="h-4.5 w-4.5" compact />
                    ),
                },
            ],
        },
    }
}

export function InstallBanner(props: {
    model: InstallBannerModel
    onPrimaryAction: () => void
    onDismiss: () => void
}): JSX.Element {
    return (
        <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-md animate-slide-up sm:inset-x-4">
            <div className="ds-panel ds-install-banner-surface">
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
                            <span className="ds-install-platform-badge">{props.model.platformLabel}</span>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-[var(--app-fg)]">{props.model.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--app-hint)]">{props.model.description}</p>
                        <div className="mt-4 flex items-center gap-2">
                            <Button size="sm" className="ds-install-action-button" onClick={props.onPrimaryAction}>
                                {props.model.actionLabel}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
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
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--ds-overlay)] backdrop-blur-md">
            <div className="ds-dialog-surface ds-install-guide-sheet space-y-5 animate-slide-up">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="ds-install-badge">{props.model.badge}</div>
                        <div className="mt-4 flex items-center gap-3">
                            <InstallLabIcon iconNode={starNorth} tone="coral" iconClassName="h-5.5 w-5.5" />
                            <div>
                                <h3 className="text-lg font-semibold text-[var(--app-fg)]">{props.model.title}</h3>
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
                    className="w-full"
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

function InstallLabIcon(props: {
    iconNode: LabIconNode
    tone: InstallTone
    iconClassName?: string
    compact?: boolean
}): JSX.Element {
    return (
        <span
            className={cn('ds-install-lab-icon', props.compact ? 'ds-install-lab-icon-compact' : null)}
            style={INSTALL_ICON_TONES[props.tone]}
        >
            <Icon iconNode={props.iconNode as never} className={cn('h-5 w-5', props.iconClassName)} strokeWidth={2.1} />
        </span>
    )
}
