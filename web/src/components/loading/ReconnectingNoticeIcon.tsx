import type { JSX } from 'react'

export function ReconnectingNoticeIcon(): JSX.Element {
    return (
        <span className="ds-reconnect-notice-icon" aria-hidden="true">
            <span className="ds-reconnect-notice-icon-rail">
                <span className="ds-reconnect-notice-icon-fill" />
            </span>
        </span>
    )
}
