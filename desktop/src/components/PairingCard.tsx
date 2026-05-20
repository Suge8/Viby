import { type JSX, useEffect } from 'react'
import { CloseIcon, CopyIcon, PairedIcon } from '@/components/icons'
import { PresenceSwap } from '@/components/motion'
import { buildDesktopPairingPresentation, shouldOfferPairingCodeCopy } from '@/lib/pairingModalSupport'
import { buildPairingQrCodeModel } from '@/lib/pairingQrCode'
import type { DesktopPairingSession, PairingBridgeState, PairingSessionSnapshot } from '@/types'

interface PairingCardProps {
    pairing: DesktopPairingSession
    bridgeState: PairingBridgeState
    onDismiss: () => void
    onCopyCode?: (code: string) => void
}

export function PairingCard({ pairing, bridgeState, onDismiss, onCopyCode }: PairingCardProps): JSX.Element {
    const snapshot: PairingSessionSnapshot = bridgeState.pairing ?? pairing.pairing
    const presentation = buildDesktopPairingPresentation({ ...pairing, pairing: snapshot })
    const qrCode = buildPairingQrCodeModel(presentation.qrUrl)
    // The six-digit verification code only appears while the phone is
    // waiting for the user to type it back into the workspace shell. The
    // copy affordance is gated on the approval stage so the bound stage
    // (where `codeValue` becomes "已连接") never surfaces a meaningless
    // copy button.
    const showCopyCode = shouldOfferPairingCodeCopy(presentation.stage) && Boolean(onCopyCode)
    const rawCode = presentation.codeValue.replace(/\s+/g, '')
    const paired = presentation.stage === 'bound'
    const stageKey = `${presentation.stage}:${presentation.codeValue}:${presentation.statusHint ?? ''}`

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                onDismiss()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onDismiss])

    return (
        <>
            <button aria-label="关闭" className="desktop-pairing-close" onClick={onDismiss} type="button">
                <CloseIcon />
            </button>
            <div className={`desktop-pairing-grid is-${presentation.stage}${paired ? ' is-connected' : ''}`}>
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
                <div className="desktop-pairing-side">
                    <PresenceSwap switchKey={stageKey} className="desktop-pairing-stage">
                        {presentation.codeHint ? (
                            <div className="desktop-pairing-side-top">
                                <span>{presentation.codeHint}</span>
                            </div>
                        ) : null}
                        {presentation.codeValue ? (
                            <div className={`desktop-pairing-code is-${presentation.stage}`}>
                                {paired ? <PairedIcon /> : null}
                                <strong>{presentation.codeValue}</strong>
                                {showCopyCode ? (
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
                        {presentation.statusHint ? <small>{presentation.statusHint}</small> : null}
                        {presentation.guidance ? (
                            <p className="desktop-pairing-guidance">{presentation.guidance}</p>
                        ) : null}
                    </PresenceSwap>
                </div>
            </div>
        </>
    )
}
