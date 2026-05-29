import type { RefObject } from 'react'
import { FolderOpenIcon } from '@/components/icons'
import { useTranslation } from '@/lib/use-translation'
import { DirectorySection, type DirectorySectionProps } from './DirectorySection'
import { NewSessionSectionCard } from './NewSessionSectionCard'
import { SessionTypeSelector } from './SessionTypeSelector'
import type { SessionType } from './types'

type WorkspaceSectionProps = {
    directory: DirectorySectionProps
    sessionType: SessionType
    worktreeName: string
    worktreeInputRef: RefObject<HTMLInputElement | null>
    isDisabled: boolean
    showSessionType: boolean
    onSessionTypeChange: (value: SessionType) => void
    onWorktreeNameChange: (value: string) => void
}

export function WorkspaceSection(props: WorkspaceSectionProps): React.JSX.Element {
    const { t } = useTranslation()
    return (
        <NewSessionSectionCard
            title={t('newSession.workspace')}
            icon={<FolderOpenIcon className="h-3.5 w-3.5" />}
            accent="gold"
        >
            <div className="space-y-3">
                <DirectorySection {...props.directory} />
                {props.showSessionType ? (
                    <SessionTypeSelector
                        sessionType={props.sessionType}
                        worktreeName={props.worktreeName}
                        worktreeInputRef={props.worktreeInputRef}
                        isDisabled={props.isDisabled}
                        onSessionTypeChange={props.onSessionTypeChange}
                        onWorktreeNameChange={props.onWorktreeNameChange}
                    />
                ) : null}
            </div>
        </NewSessionSectionCard>
    )
}
