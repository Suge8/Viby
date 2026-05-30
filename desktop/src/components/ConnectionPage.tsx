import { type JSX } from 'react'
import hubBootAnimationUrl from '@/assets/hub-boot.lottie?url'
import monkeySeeAnimationUrl from '@/assets/monkey-see.lottie?url'
import { DesktopToggle } from '@/components/DesktopToggle'
import { DeviceCount } from '@/components/DeviceCount'
import { DeviceIcon, DoorIcon, LinkIcon, PowerIcon, PublicAccessIcon, QrIcon } from '@/components/icons'
import { LottiePlayer } from '@/components/LottiePlayer'
import { OverlayTransition, PageTransition, StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import type { PresentedDevice } from '@/lib/deviceListPresentation'
import type { EntryPreviewModel } from '@/lib/entryMode'
import type { HubViewState } from '@/lib/hubSnapshot'

export type AccessEntryRow = {
    label: string
    value: string
    source: 'broker' | 'lan'
}

type ConnectionPageProps = {
    busy: boolean
    copy: DesktopCopy
    accessEntries: AccessEntryRow[]
    activeDeviceCount: number
    devices: PresentedDevice[]
    deviceLinks: DeviceLinkSnapshotMap
    publicAccessEnabled: boolean
    publicAccessDisabled: boolean
    publicAccessBusy: boolean
    deviceActionLabel: string
    deviceActionVisible: boolean
    viewState: HubViewState
    onOpenBrokerInvite(): void
    onOpenLanInvite(): void
    onPairingAction(): void
    onPublicAccessChange(value: boolean): void
    onRevokeDevice(deviceId: string): void | Promise<void>
}

function EntryAddress(props: {
    disabled: boolean
    label: string
    openLabel: string
    value: string
    onOpen(): void
}): JSX.Element {
    return (
        <div className="desktop-entry-address">
            <div>
                <span>{props.label}</span>
                <strong>{props.value}</strong>
            </div>
            <button
                type="button"
                className="desktop-entry-button"
                disabled={props.disabled}
                aria-label={`${props.openLabel}: ${props.value}`}
                onClick={props.onOpen}
            >
                <LinkIcon />
            </button>
        </div>
    )
}

function HubBootState(props: { visible: boolean }): JSX.Element {
    return (
        <OverlayTransition visible={props.visible} className="desktop-page desktop-page-centered desktop-hub-boot-page">
            <section className="desktop-hub-boot-card" aria-busy={props.visible} aria-label="中枢正在启动">
                <div className="desktop-hub-boot-glow" aria-hidden="true" />
                <LottiePlayer
                    active={props.visible}
                    src={hubBootAnimationUrl}
                    className="desktop-hub-boot-lottie"
                    label="中枢启动动画"
                />
            </section>
        </OverlayTransition>
    )
}

function ConnectionUnavailable(props: ConnectionPageProps): JSX.Element {
    return (
        <div className="desktop-page desktop-page-centered">
            <StaggerGroup>
                <StaggerItem>
                    <section className="desktop-connection-empty" aria-label={props.copy.navConnection}>
                        <span className="desktop-connection-empty-icon" aria-hidden="true">
                            <LottiePlayer
                                active
                                src={monkeySeeAnimationUrl}
                                className="desktop-connection-empty-lottie"
                                label="待启动动画"
                            />
                        </span>
                        <strong className="desktop-connection-empty-title">
                            <PowerIcon />
                            {props.copy.connectionNeedsHub}
                        </strong>
                    </section>
                </StaggerItem>
            </StaggerGroup>
        </div>
    )
}

function DeviceCard(props: ConnectionPageProps): JSX.Element {
    return (
        <StaggerItem className="desktop-feature-card desktop-mobile-card">
            <div className="desktop-card-heading">
                <span className="desktop-card-heading-icon" aria-hidden="true">
                    <DeviceIcon />
                </span>
                <h2>{props.copy.deviceTitle}</h2>
            </div>
            <div className="desktop-card-body">
                {props.deviceActionVisible ? (
                    <button
                        type="button"
                        className="desktop-mobile-action"
                        aria-label={props.deviceActionLabel}
                        disabled={props.busy}
                        onClick={props.onPairingAction}
                    >
                        <span className="desktop-mobile-action-icon" aria-hidden="true">
                            <QrIcon />
                        </span>
                    </button>
                ) : null}
                <DeviceCount
                    count={props.activeDeviceCount}
                    devices={props.devices}
                    links={props.deviceLinks}
                    onRevokeDevice={props.onRevokeDevice}
                />
            </div>
        </StaggerItem>
    )
}

function AccessHelp(props: { copy: DesktopCopy }): JSX.Element {
    return (
        <div className="desktop-access-help">
            <button type="button" className="desktop-help-button" aria-label={props.copy.accessHelp}>
                <span aria-hidden="true">?</span>
            </button>
            <div className="desktop-access-help-popover" role="tooltip">
                <div className="desktop-access-help-item">
                    <QrIcon />
                    <span>{props.copy.accessHelpPublic}</span>
                </div>
                <div className="desktop-access-help-item">
                    <LinkIcon />
                    <span>{props.copy.accessHelpLan}</span>
                </div>
            </div>
        </div>
    )
}

function PublicAccessControl(props: ConnectionPageProps): JSX.Element {
    const titleId = 'desktop-public-access-label'
    const stateLabel = props.publicAccessBusy
        ? props.copy.publicAccessStateBusy
        : props.publicAccessEnabled
          ? props.copy.publicAccessStateOn
          : props.copy.publicAccessStateOff
    const className = `desktop-public-access-control ${props.publicAccessEnabled ? 'is-on' : 'is-off'} ${
        props.publicAccessBusy ? 'is-busy' : ''
    }`
    return (
        <div className={className} aria-busy={props.publicAccessBusy}>
            <span className="desktop-public-access-icon" aria-hidden="true">
                <PublicAccessIcon />
            </span>
            <div className="desktop-public-access-copy">
                <strong id={titleId}>{props.copy.publicAccessTitle}</strong>
                <span className="desktop-public-access-state">{stateLabel}</span>
            </div>
            <DesktopToggle
                checked={props.publicAccessEnabled}
                disabled={props.publicAccessDisabled || props.publicAccessBusy}
                labelId={titleId}
                onClick={() => props.onPublicAccessChange(!props.publicAccessEnabled)}
            />
        </div>
    )
}

function AccessCard(props: ConnectionPageProps): JSX.Element {
    return (
        <StaggerItem className="desktop-feature-card">
            <div className="desktop-card-heading-bar">
                <div className="desktop-card-heading">
                    <span className="desktop-card-heading-icon" aria-hidden="true">
                        <DoorIcon />
                    </span>
                    <h2>{props.copy.accessTitle}</h2>
                </div>
                <AccessHelp copy={props.copy} />
            </div>
            <div className="desktop-card-body">
                <div className="desktop-entry-row">
                    {props.accessEntries.map((entry) => (
                        <EntryAddress
                            key={`${entry.source}:${entry.value}`}
                            disabled={props.busy}
                            label={entry.label}
                            openLabel={props.copy.openEntry}
                            value={entry.value}
                            onOpen={entry.source === 'broker' ? props.onOpenBrokerInvite : props.onOpenLanInvite}
                        />
                    ))}
                </div>
            </div>
        </StaggerItem>
    )
}

function ConnectionReady(props: ConnectionPageProps): JSX.Element {
    return (
        <div className="desktop-page">
            <StaggerGroup className="desktop-connection-ready" stagger={0.08}>
                <StaggerItem className="desktop-public-access-row">
                    <PublicAccessControl {...props} />
                </StaggerItem>
                <div className="desktop-connection-grid">
                    <DeviceCard {...props} />
                    <AccessCard {...props} />
                </div>
            </StaggerGroup>
        </div>
    )
}

export function ConnectionPage(props: ConnectionPageProps): JSX.Element {
    const contentTransitionKey = props.viewState.ready ? 'ready' : 'offline'

    return (
        <div className="desktop-connection-stage">
            <HubBootState visible={props.viewState.booting} />
            {props.viewState.booting ? null : (
                <PageTransition transitionKey={contentTransitionKey}>
                    {props.viewState.ready ? <ConnectionReady {...props} /> : <ConnectionUnavailable {...props} />}
                </PageTransition>
            )}
        </div>
    )
}
