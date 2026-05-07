import type { JSX } from 'react'
import { ControlPill } from '@/components/ControlPill'
import { CheckIcon, KeyIcon, LinkIcon, OpenIcon, PhoneIcon, QrIcon } from '@/components/icons'
import { StaggerGroup, StaggerItem } from '@/components/motion'
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
    onRemovePairing(): void
}

function DeviceSummary(props: { busy: boolean; summary: PairingConnectionSummary; onRemove(): void }): JSX.Element {
    return (
        <div className={`desktop-device-summary ${props.summary.connected ? 'is-connected' : ''}`}>
            <span>
                <strong>{props.summary.deviceCount}</strong>
                <span>台设备</span>
            </span>
            <div>
                <strong>{props.summary.title}</strong>
                <small>{props.summary.detail}</small>
            </div>
            {props.summary.removable ? (
                <button
                    aria-label="解除手机绑定"
                    className="desktop-device-remove"
                    disabled={props.busy}
                    onClick={props.onRemove}
                    type="button"
                >
                    解除绑定
                </button>
            ) : null}
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
                <OpenIcon />
            </button>
        </div>
    )
}

export function ConnectionPage(props: ConnectionPageProps): JSX.Element {
    if (!props.viewState.ready) {
        return (
            <div className="desktop-page desktop-page-centered">
                <section className="desktop-connection-empty" aria-label={props.copy.navConnection}>
                    <span className="desktop-connection-empty-icon" aria-hidden="true">
                        <PhoneIcon />
                    </span>
                    <strong>{props.copy.connectionNeedsHub}</strong>
                    {props.pairingConnection.kind !== 'empty' ? (
                        <DeviceSummary
                            busy={props.busy}
                            summary={props.pairingConnection}
                            onRemove={props.onRemovePairing}
                        />
                    ) : null}
                </section>
            </div>
        )
    }

    return (
        <div className="desktop-page">
            <StaggerGroup className="desktop-connection-grid" stagger={0.08}>
                <StaggerItem className="desktop-feature-card desktop-mobile-card">
                    <div className="desktop-card-heading">
                        <span>{props.copy.phoneKicker}</span>
                        <h2>{props.copy.phoneTitle}</h2>
                    </div>
                    <button
                        type="button"
                        className="desktop-mobile-action"
                        disabled={!props.viewState.ready || props.busy || props.pairingConnection.kind === 'bound'}
                        onClick={props.onPairingAction}
                    >
                        <span className="desktop-mobile-action-icon" aria-hidden="true">
                            {props.pairingConnection.connected ? <CheckIcon /> : <QrIcon />}
                        </span>
                        <span>
                            {props.viewState.ready ? props.pairingConnection.actionLabel : props.copy.phoneWaiting}
                        </span>
                    </button>
                    <DeviceSummary
                        busy={props.busy}
                        summary={props.pairingConnection}
                        onRemove={props.onRemovePairing}
                    />
                </StaggerItem>

                <StaggerItem className="desktop-feature-card desktop-access-card">
                    <div className="desktop-card-heading">
                        <span>{props.copy.accessKicker}</span>
                        <h2>{props.copy.accessTitle}</h2>
                    </div>
                    <div className="desktop-entry-row">
                        <span className="desktop-entry-icon" aria-hidden="true">
                            <LinkIcon />
                        </span>
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
            </StaggerGroup>
        </div>
    )
}
