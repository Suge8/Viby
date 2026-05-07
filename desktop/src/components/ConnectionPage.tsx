import { type JSX } from 'react'
import hubBootAnimationUrl from '@/assets/hub-boot.lottie?url'
import monkeySeeAnimationUrl from '@/assets/monkey-see.lottie?url'
import { ControlPill } from '@/components/ControlPill'
import { DoorIcon, KeyIcon, LinkIcon, PhoneIcon, PowerIcon, QrIcon } from '@/components/icons'
import { LottiePlayer } from '@/components/LottiePlayer'
import { OverlayTransition, PageTransition, StaggerGroup, StaggerItem } from '@/components/motion'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { EntryPreviewModel } from '@/lib/entryMode'
import type { HubViewState } from '@/lib/hubSnapshot'
import type { PairingConnectionSummary } from '@/lib/pairingBridgeSupport'

type ConnectionPageProps = {
    busy: boolean
    canCopyToken: boolean
    copy: DesktopCopy
    entryPreview: EntryPreviewModel
    pairingConnection: PairingConnectionSummary
    viewState: HubViewState
    onCopyToken(): void
    onOpenEntry(url: string): void
    onPairingAction(): void
}

function DeviceSummary(props: { summary: PairingConnectionSummary }): JSX.Element {
    return (
        <div className={`desktop-device-summary is-${props.summary.tone}`}>
            <span className="desktop-device-status" aria-hidden="true" />
            <div className="desktop-device-copy">
                <strong>{props.summary.title}</strong>
                {props.summary.detail ? <small>{props.summary.detail}</small> : null}
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
                        {props.pairingConnection.kind !== 'empty' ? (
                            <DeviceSummary summary={props.pairingConnection} />
                        ) : null}
                    </section>
                </StaggerItem>
            </StaggerGroup>
        </div>
    )
}

function MobileCard(props: ConnectionPageProps): JSX.Element {
    return (
        <StaggerItem className="desktop-feature-card desktop-mobile-card">
            <div className="desktop-card-heading">
                <span className="desktop-card-heading-icon" aria-hidden="true">
                    <PhoneIcon />
                </span>
                <h2>{props.copy.phoneTitle}</h2>
            </div>
            <button
                type="button"
                className="desktop-mobile-action"
                disabled={!props.viewState.ready || props.busy}
                onClick={props.onPairingAction}
            >
                <span className="desktop-mobile-action-icon" aria-hidden="true">
                    <QrIcon />
                </span>
                {!props.viewState.ready ? (
                    <span className="desktop-mobile-action-label">{props.copy.phoneWaiting}</span>
                ) : null}
            </button>
            <DeviceSummary summary={props.pairingConnection} />
        </StaggerItem>
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
            <div className="desktop-entry-row">
                <div className="desktop-entry-copy">
                    <EntryAddress
                        disabled={props.busy}
                        label={props.entryPreview.displayLabel}
                        openLabel={props.copy.openEntry}
                        url={props.entryPreview.openUrl}
                        value={props.entryPreview.displayValue}
                        onOpen={props.onOpenEntry}
                    />
                    {props.entryPreview.secondaryValue ? (
                        <EntryAddress
                            disabled={props.busy}
                            label={props.entryPreview.secondaryLabel}
                            openLabel={props.copy.openEntry}
                            url={props.entryPreview.secondaryOpenUrl}
                            value={props.entryPreview.secondaryValue}
                            onOpen={props.onOpenEntry}
                        />
                    ) : null}
                </div>
            </div>
            <ControlPill
                disabled={props.busy || !props.canCopyToken}
                icon={<KeyIcon />}
                label={props.copy.copyToken}
                onClick={props.onCopyToken}
            />
        </StaggerItem>
    )
}

function ConnectionReady(props: ConnectionPageProps): JSX.Element {
    return (
        <div className="desktop-page">
            <StaggerGroup className="desktop-connection-grid" stagger={0.08}>
                <MobileCard {...props} />
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
