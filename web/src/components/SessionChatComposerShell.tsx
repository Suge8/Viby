import type { ReactNode, RefObject } from 'react'
import { SESSION_CHAT_COMPOSER_STAGE_TEST_ID } from '@/lib/sessionUiContracts'

type SessionChatComposerShellProps = {
    children: ReactNode
    containerRef?: RefObject<HTMLDivElement | null>
}

export function SessionChatComposerShell(props: SessionChatComposerShellProps): React.JSX.Element {
    // `px-3` lives on the inner stage shell (mirroring SessionHeader) so the
    // measured composer rect (`containerRef`) reflects the same outer edge as
    // the header stage shell, and the desktop grid columns align tightly with
    // SessionHeader's back/title/more columns.
    return (
        <div className="session-chat-composer-shell ds-composer-shell shrink-0">
            <div
                ref={props.containerRef}
                className="mx-auto w-full ds-stage-shell px-3"
                data-testid={SESSION_CHAT_COMPOSER_STAGE_TEST_ID}
            >
                {props.children}
            </div>
        </div>
    )
}
