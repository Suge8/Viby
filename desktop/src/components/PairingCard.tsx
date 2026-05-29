import { type JSX, useEffect } from 'react'
import { CloseIcon, CopyIcon, LinkIcon, PairedIcon } from '@/components/icons'
import { PresenceSwap } from '@/components/motion'
import { buildDesktopPairingPresentation, shouldOfferPairingCodeCopy } from '@/lib/pairingModalSupport'
import { buildPairingQrCodeModel } from '@/lib/pairingQrCode'
import type { PairingBridgeState, PairingSessionSnapshot } from '@/types'

/**
 * Structural shape used by the modal. Both `DesktopPairingSession` (broker)
 * and `DesktopLanPairingSession` (hub LAN) satisfy it; the modal never reads
 * transport-specific fields like `wsUrl` or `hostToken`.
 */
export interface PairingInviteLike {
    pairing: PairingSessionSnapshot
    pairingUrl: string
}

interface PairingCardProps {
    pairing: PairingInviteLike
    bridgeState: PairingBridgeState
    onDismiss: () => void
    /** QR appears when the host opened the modal from the QR icon. Address
     *  rows open in `showQr=false` mode, where the QR is hidden and a
     *  copy-link affordance takes its place. The two modes never overlap. */
    showQr?: boolean
    onCopyCode?: (code: string) => void
    onCopyLink?: (url: string) => void
}

export function PairingCard({
    pairing,
    bridgeState,
    onDismiss,
    showQr = true,
    onCopyCode,
    onCopyLink,
}: PairingCardProps): JSX.Element {
    const snapshot: PairingSessionSnapshot = bridgeState.pairing ?? pairing.pairing
    const presentation = buildDesktopPairingPresentation({ ...pairing, pairing: snapshot }, bridgeState.phase)
    const qrCode = showQr ? buildPairingQrCodeModel(presentation.qrUrl) : null
    const showCodeCopy = shouldOfferPairingCodeCopy(presentation.stage) && Boolean(onCopyCode)
    const showLinkCopy = !showQr && presentation.stage === 'invite' && Boolean(onCopyLink)
    const rawCode = presentation.codeValue.replace(/\s+/g, '')
    const paired = presentation.stage === 'bound'
    const stageKey = `${presentation.stage}:${presentation.codeValue}`

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') onDismiss()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onDismiss])

    return (
        <>
            <button aria-label="关闭" className="desktop-pairing-close" onClick={onDismiss} type="button">
                <CloseIcon />
            </button>
            <div
                className={`desktop-pairing-grid is-${presentation.stage}${paired ? ' is-connected' : ''}${
                    qrCode ? '' : ' is-no-qr'
                }`}
            >
                {qrCode ? (
                    <div className="desktop-pairing-qr">
                        <div className="desktop-pairing-image" aria-label="Viby 设备连接二维码" role="img">
                            <svg viewBox={qrCode.viewBox} className="desktop-pairing-svg" aria-hidden="true">
                                <path d={qrCode.path} />
                            </svg>
                            {paired ? (
                                <span className="desktop-pairing-success" aria-hidden="true">
                                    <PairedIcon />
                                </span>
                            ) : null}
                        </div>
                    </div>
                ) : null}
                <div className="desktop-pairing-side">
                    <PresenceSwap switchKey={stageKey} className="desktop-pairing-stage">
                        {presentation.codeHint ? (
                            <span className="desktop-pairing-hint">{presentation.codeHint}</span>
                        ) : null}
                        {presentation.codeValue ? (
                            <div className={`desktop-pairing-code is-${presentation.stage}`}>
                                <span className="desktop-pairing-code-text">
                                    {paired ? <PairedIcon /> : null}
                                    <strong>{presentation.codeValue}</strong>
                                </span>
                                {showCodeCopy ? (
                                    <button
                                        type="button"
                                        className="desktop-pairing-code-copy"
                                        aria-label={`复制配对码 ${rawCode}`}
                                        onClick={() => onCopyCode?.(rawCode)}
                                    >
                                        <CopyIcon />
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                        {showLinkCopy ? (
                            <button
                                type="button"
                                className="desktop-pairing-link-copy"
                                onClick={() => onCopyLink?.(presentation.qrUrl)}
                            >
                                <LinkIcon />
                                <span>复制链接</span>
                            </button>
                        ) : null}
                    </PresenceSwap>
                </div>
            </div>
        </>
    )
}
