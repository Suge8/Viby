import { buildPairingLinkPresentation } from '@viby/protocol/pairing'
import { type JSX, useEffect } from 'react'
import { CheckIcon, CloseIcon } from '@/components/icons'
import { buildDesktopPairingPresentation } from '@/lib/pairingModalSupport'
import { buildPairingQrCodeModel } from '@/lib/pairingQrCode'
import type { DesktopPairingSession, PairingBridgeState, PairingSessionSnapshot } from '@/types'

interface PairingCardProps {
    pairing: DesktopPairingSession
    bridgeState: PairingBridgeState
    onDismiss: () => void
}

export function PairingCard({ pairing, bridgeState, onDismiss }: PairingCardProps): JSX.Element {
    const snapshot: PairingSessionSnapshot = bridgeState.pairing ?? pairing.pairing
    const presentation = buildDesktopPairingPresentation({ ...pairing, pairing: snapshot }, bridgeState.phase)
    const connected = presentation.stage === 'ready'
    const linkGuidance = connected ? buildPairingLinkPresentation(bridgeState.stats ?? null) : null
    const qrCode = buildPairingQrCodeModel(presentation.qrUrl)

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
            <div className={`desktop-pairing-grid ${connected ? 'is-connected' : ''}`}>
                <div className="desktop-pairing-qr">
                    <div className="desktop-pairing-image" aria-label="Viby 手机连接二维码" role="img">
                        <svg viewBox={qrCode.viewBox} className="desktop-pairing-svg" aria-hidden="true">
                            <path d={qrCode.path} />
                        </svg>
                        {connected ? (
                            <span className="desktop-pairing-success" aria-hidden="true">
                                <CheckIcon />
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="desktop-pairing-side">
                    <div className="desktop-pairing-side-top">
                        <span>{presentation.codeHint}</span>
                    </div>
                    <strong>{presentation.codeValue}</strong>
                    <small className={linkGuidance ? `is-ready is-${linkGuidance.tone}` : ''}>
                        {linkGuidance?.title ?? presentation.statusHint}
                    </small>
                    <p className="desktop-pairing-guidance">{linkGuidance?.detail ?? presentation.guidance}</p>
                </div>
            </div>
        </>
    )
}
