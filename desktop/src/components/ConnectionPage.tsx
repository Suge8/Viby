import { type JSX } from 'react'
import hubBootAnimationUrl from '@/assets/hub-boot.lottie?url'
import monkeySeeAnimationUrl from '@/assets/monkey-see.lottie?url'
import { DesktopToggle } from '@/components/DesktopToggle'
import { DeviceCount } from '@/components/DeviceCount'
import { CopyIcon, DeviceIcon, DoorIcon, LinkIcon, PowerIcon, QrIcon } from '@/components/icons'
import { LottiePlayer } from '@/components/LottiePlayer'
import { OverlayTransition, PageTransition, StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import type { DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import type { EntryPreviewModel } from '@/lib/entryMode'
import type { HubViewState } from '@/lib/hubSnapshot'

type PublicEntryModel = {
    label: string
    value: string
    onCopy(): void
}

type ConnectionPageProps = {
    busy: boolean
    copy: DesktopCopy
    entryPreview: EntryPreviewModel
    publicEntry: PublicEntryModel | null
    activeDeviceCount: number
    devices: DeviceAuthDevice[]
    deviceLinks: DeviceLinkSnapshotMap
    publicAccessEnabled: boolean
    publicAccessDisabled: boolean
    deviceActionLabel: string
    deviceActionVisible: boolean
    viewState: HubViewState
    onOpenEntry(url: string): void
    onPairingAction(): void
    onPublicAccessChange(value: boolean): void
    onRevokeDevice(deviceId: string): void | Promise<void>
}

function PublicEntryAddress(props: { disabled: boolean; entry: PublicEntryModel; copyLabel: string }): JSX.Element {
    return (
        <div className="desktop-entry-address">
            <div>
                <span>{props.entry.label}</span>
                <strong>{props.entry.value}</strong>
            </div>
            <div className="desktop-entry-actions">
                <button
                    type="button"
                    className="desktop-copy-icon"
                    disabled={props.disabled}
                    aria-label={`${props.copyLabel}: ${props.entry.value}`}
                    onClick={props.entry.onCopy}
                >
                    <CopyIcon />
                </button>
            </div>
        </div>
    )
}

function EntryAddress(props: {
    disabled: boolean
    label?: string
    openLabel: string
    url?: string
    value: string
    onOpen(url: string): void
}): JSX.Element {
    return (
        <div className="desktop-entry-address">
            <div>
                {props.label ? <span>{props.label}</span> : null}
                <strong>{props.value}</strong>
            </div>
            <button
                type="button"
                className="desktop-copy-icon"
                disabled={props.disabled || !props.url}
                aria-label={`${props.openLabel}: ${props.value}`}
                onClick={() => props.url && props.onOpen(props.url)}
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
        </StaggerItem>
    )
}

function AccessHelpPopover(props: { copy: DesktopCopy }): JSX.Element {
    return (
        <div className="desktop-access-help-popover">
            <div className="desktop-access-help-item">
                <QrIcon />
                <span>{props.copy.accessHelpPublic}</span>
            </div>
            <div className="desktop-access-help-item">
                <LinkIcon />
                <span>{props.copy.accessHelpLan}</span>
            </div>
        </div>
    )
}

function PublicAccessControl(props: ConnectionPageProps): JSX.Element {
    const titleId = 'desktop-public-access-label'
    const hint = props.publicAccessEnabled ? props.copy.publicAccessOnHint : props.copy.publicAccessOffHint
    return (
        <div className={`desktop-public-access-control ${props.publicAccessEnabled ? 'is-on' : 'is-off'}`}>
            <div className="desktop-public-access-copy">
                <span className="desktop-public-access-icon" aria-hidden="true">
                    {props.publicAccessEnabled ? <QrIcon /> : <LinkIcon />}
                </span>
                <div>
                    <strong id={titleId}>{props.copy.publicAccessTitle}</strong>
                    <span>{hint}</span>
                </div>
            </div>
            <DesktopToggle
                checked={props.publicAccessEnabled}
                disabled={props.publicAccessDisabled}
                labelId={titleId}
                onClick={() => props.onPublicAccessChange(!props.publicAccessEnabled)}
            />
        </div>
    )
}

function AccessCard(props: ConnectionPageProps): JSX.Element {
    return (
        <StaggerItem className="desktop-feature-card desktop-access-card">
            <div className="desktop-card-heading">
                <span className="desktop-card-heading-icon" aria-hidden="true">
                    <DoorIcon />
                </span>
                <h2>{props.copy.accessTitle}</h2>
            </div>
            <div className="desktop-access-help">
                <button type="button" className="desktop-help-button" aria-label={props.copy.accessHelp}>
                    <span aria-hidden="true">?</span>
                </button>
                <AccessHelpPopover copy={props.copy} />
            </div>
            <PublicAccessControl {...props} />
            <div className="desktop-entry-row">
                <div className="desktop-entry-copy">
                    {props.publicEntry ? (
                        <PublicEntryAddress
                            disabled={props.busy}
                            entry={props.publicEntry}
                            copyLabel={props.copy.copyPublicEntry}
                        />
                    ) : null}
                    {props.entryPreview.entries.map((entry) => (
                        <EntryAddress
                            key={`${entry.label}:${entry.value}`}
                            disabled={props.busy}
                            label={entry.label}
                            openLabel={props.copy.openEntry}
                            url={entry.url}
                            value={entry.value}
                            onOpen={props.onOpenEntry}
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
            <StaggerGroup className="desktop-connection-grid" stagger={0.08}>
                <DeviceCard {...props} />
                <AccessCard {...props} />
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
