import type { Session } from '@/types/api'
import { AppNotice } from '@/components/AppNotice'
import { LockIcon } from '@/components/icons'

export function MemberReadOnlyComposer(props: {
    session: Session
}): React.JSX.Element {
    const teamContext = props.session.teamContext
    const managerTitle = teamContext?.managerTitle ?? '经理'

    return (
        <div className="session-chat-composer-shell ds-composer-shell shrink-0 px-3 pb-3">
            <div className="mx-auto w-full ds-stage-shell">
                <AppNotice
                    layout="inline"
                    tone="warning"
                    icon={<LockIcon className="h-4 w-4" />}
                    title="当前输入区保持只读"
                    description={`${managerTitle} 正在管理这个成员。先用顶部“插话一次”，或接管成员后再恢复完整输入。`}
                />
            </div>
        </div>
    )
}
