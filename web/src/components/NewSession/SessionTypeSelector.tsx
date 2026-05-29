import { LayoutGroup, m } from 'motion/react'
import { type RefObject, useMemo } from 'react'
import { FeatureFolderIcon as FolderIcon, FeatureGitBranchIcon as GitBranchIcon } from '@/components/featureIcons'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { Input } from '@/components/ui/input'
import { PlainButton } from '@/components/ui/plain-button'
import { useTranslation } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import type { SessionType } from './types'

const PILL_TRANSITION = { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.7 }

type SessionTypeOption = {
    value: SessionType
    label: string
    icon: React.JSX.Element
}

type SessionTypeSelectorProps = {
    sessionType: SessionType
    worktreeName: string
    worktreeInputRef: RefObject<HTMLInputElement | null>
    isDisabled: boolean
    onSessionTypeChange: (value: SessionType) => void
    onWorktreeNameChange: (value: string) => void
}

export function SessionTypeSelector(props: SessionTypeSelectorProps): React.JSX.Element {
    const { t } = useTranslation()
    const options = useMemo<ReadonlyArray<SessionTypeOption>>(
        () => [
            { value: 'simple', label: t('newSession.type.simple'), icon: <FolderIcon className="h-4 w-4" /> },
            { value: 'worktree', label: t('newSession.type.worktree'), icon: <GitBranchIcon className="h-4 w-4" /> },
        ],
        [t]
    )

    return (
        <div className="ds-session-type-stack">
            <LayoutGroup id="new-session-type">
                <div role="radiogroup" aria-label={t('newSession.type')} className="ds-session-type-segmented">
                    {options.map((option) => {
                        const active = props.sessionType === option.value
                        return (
                            <PlainButton
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                disabled={props.isDisabled}
                                onClick={() => props.onSessionTypeChange(option.value)}
                                className={cn(
                                    'ds-session-type-segment',
                                    active ? 'ds-session-type-segment-active' : 'ds-session-type-segment-idle'
                                )}
                            >
                                {active ? (
                                    <m.span
                                        layoutId="new-session-type-pill"
                                        transition={PILL_TRANSITION}
                                        className="ds-session-type-segment-pill"
                                    />
                                ) : null}
                                <span className="relative inline-flex items-center gap-2">
                                    {option.icon}
                                    <span>{option.label}</span>
                                </span>
                            </PlainButton>
                        )
                    })}
                </div>
            </LayoutGroup>

            <CollapsiblePanel open={props.sessionType === 'worktree'}>
                <Input
                    ref={props.worktreeInputRef}
                    type="text"
                    placeholder={t('newSession.type.worktree.placeholder')}
                    value={props.worktreeName}
                    onChange={(event) => props.onWorktreeNameChange(event.target.value)}
                    disabled={props.isDisabled}
                    className="ds-field-control-elevated"
                    aria-label={t('newSession.type.worktree')}
                />
            </CollapsiblePanel>
        </div>
    )
}
