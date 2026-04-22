import type { ReactNode, RefObject } from 'react'
import { SESSION_CHAT_COMPOSER_STAGE_TEST_ID } from '@/lib/sessionUiContracts'

type SessionChatComposerShellProps = {
    children: ReactNode
    containerRef?: RefObject<HTMLDivElement | null>
}

export function SessionChatComposerShell(props: SessionChatComposerShellProps): React.JSX.Element {
    return (
        <div className="session-chat-composer-shell ds-composer-shell shrink-0 px-3">
            <div
                ref={props.containerRef}
                className="mx-auto w-full ds-stage-shell"
                data-testid={SESSION_CHAT_COMPOSER_STAGE_TEST_ID}
            >
                {props.children}
            </div>
        </div>
    )
}
