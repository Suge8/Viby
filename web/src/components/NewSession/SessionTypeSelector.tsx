import { useMemo, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { SessionType } from './types'
import { FolderIcon, GitBranchIcon } from '@/components/icons'
import {
    PressableSurface,
    PressableSurfaceSelectionIndicator
} from '@/components/ui/pressable-surface'
import { useTranslation } from '@/lib/use-translation'
import { NewSessionSectionCard } from './NewSessionSectionCard'

export function SessionTypeSelector(props: {
    sessionType: SessionType
    worktreeName: string
    worktreeInputRef: RefObject<HTMLInputElement | null>
    isDisabled: boolean
    onSessionTypeChange: (value: SessionType) => void
    onWorktreeNameChange: (value: string) => void
}) {
    const { t } = useTranslation()
    const sessionTypeOptions = useMemo(() => ([
        {
            type: 'simple' as const,
            icon: <FolderIcon className="h-4.5 w-4.5" />,
            title: t('newSession.type.simple'),
            description: t('newSession.type.simple.desc')
        },
        {
            type: 'worktree' as const,
            icon: <GitBranchIcon className="h-4.5 w-4.5" />,
            title: t('newSession.type.worktree'),
            description: t('newSession.type.worktree.desc')
        }
    ]), [t])

    return (
        <NewSessionSectionCard
            title={t('newSession.type')}
            icon={<GitBranchIcon className="h-5 w-5" />}
            accent="violet"
        >
            <div role="radiogroup" aria-label={t('newSession.type')} className="grid gap-2.5">
                {sessionTypeOptions.map((option) => {
                    const checked = props.sessionType === option.type
                    return (
                        <PressableSurface
                            key={option.type}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            selected={checked}
                            disabled={props.isDisabled}
                            className="gap-3"
                            onClick={() => props.onSessionTypeChange(option.type)}
                        >
                            <span className="flex items-start gap-3">
                                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--ds-border-default)] bg-[var(--app-subtle-bg)] text-[var(--ds-text-primary)]">
                                    {option.icon}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-[var(--ds-text-primary)]">
                                        {option.title}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-[var(--ds-text-secondary)]">
                                        {option.description}
                                    </span>
                                </span>
                                <PressableSurfaceSelectionIndicator selected={checked} className="mt-1" />
                            </span>
                        </PressableSurface>
                    )
                })}
            </div>

            <AnimatePresence initial={false}>
                {props.sessionType === 'worktree' ? (
                    <motion.div
                        key="worktree-name"
                        initial={{ opacity: 0, height: 0, y: -6 }}
                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                        exit={{ opacity: 0, height: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="mt-3 rounded-[18px] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_92%,transparent)] p-3.5">
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ds-text-muted)]">
                                {t('newSession.type.worktree')}
                            </label>
                            <input
                                ref={props.worktreeInputRef}
                                type="text"
                                placeholder={t('newSession.type.worktree.placeholder')}
                                value={props.worktreeName}
                                onChange={(e) => props.onWorktreeNameChange(e.target.value)}
                                disabled={props.isDisabled}
                                className="mt-2.5 min-h-[48px] w-full rounded-[16px] border border-[var(--ds-border-default)] bg-[var(--ds-panel-strong)] px-4 py-3 text-sm font-medium text-[var(--ds-text-primary)] outline-none focus:border-[var(--ds-border-strong)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--ds-accent-violet)_18%,transparent)] disabled:opacity-60"
                            />
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </NewSessionSectionCard>
    )
}
