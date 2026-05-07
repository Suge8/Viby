import type { JSX } from 'react'
import { BrandMark, NavButton } from '@/components/DesktopShellChrome'
import { AgentsIcon, ConnectIcon, PowerIcon, SettingsIcon, SpinnerIcon } from '@/components/icons'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { HubSwitchModel } from '@/lib/desktopShellModel'

export type DesktopPage = 'connection' | 'agents' | 'settings'

export function DesktopSidebar(props: {
    activePage: DesktopPage
    copy: DesktopCopy
    switchModel: HubSwitchModel
    hubReady: boolean
    onHubSwitch(): void
    onPageChange(page: DesktopPage): void
}): JSX.Element {
    return (
        <aside className="desktop-sidebar" aria-label="Viby Desktop">
            <BrandMark />
            <button
                type="button"
                className={`desktop-hub-action is-${props.switchModel.tone}`}
                disabled={props.switchModel.disabled}
                aria-label={props.hubReady ? props.copy.hubStopAction : props.copy.hubStart}
                onClick={props.onHubSwitch}
            >
                {props.switchModel.tone === 'busy' ? <SpinnerIcon /> : <PowerIcon />}
                <span>
                    {props.hubReady
                        ? props.copy.hubReadyStop
                        : props.switchModel.tone === 'busy'
                          ? props.copy.hubStarting
                          : props.copy.hubStart}
                </span>
            </button>
            <nav className="desktop-nav" aria-label={props.copy.navAria}>
                <NavButton
                    active={props.activePage === 'connection'}
                    icon={<ConnectIcon />}
                    onClick={() => props.onPageChange('connection')}
                >
                    {props.copy.navConnection}
                </NavButton>
                <NavButton
                    active={props.activePage === 'agents'}
                    icon={<AgentsIcon />}
                    onClick={() => props.onPageChange('agents')}
                >
                    {props.copy.navAgents}
                </NavButton>
            </nav>
            <div className="desktop-sidebar-footer">
                <NavButton
                    active={props.activePage === 'settings'}
                    icon={<SettingsIcon />}
                    onClick={() => props.onPageChange('settings')}
                >
                    {props.copy.navSettings}
                </NavButton>
            </div>
        </aside>
    )
}
