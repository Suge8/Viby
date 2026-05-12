import { type JSX, useEffect } from 'react'
import { CloseIcon, LinkIcon } from '@/components/icons'
import { ModalLayer } from '@/components/motion'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { LanEntryQrModel } from '@/lib/lanEntryQr'
import { buildPairingQrCodeModel } from '@/lib/pairingQrCode'

export function DesktopLanEntryModal(props: {
    copy: DesktopCopy
    entry: LanEntryQrModel | null
    open: boolean
    onClose(): void
}): JSX.Element {
    const qrCode = props.entry ? buildPairingQrCodeModel(props.entry.url) : null

    useEffect(() => {
        if (!props.open) return
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') props.onClose()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [props.open, props.onClose])

    return (
        <ModalLayer
            open={Boolean(props.open && props.entry && qrCode)}
            backdropClassName="desktop-pairing-backdrop"
            cardClassName="desktop-pairing-card"
            label={props.copy.lanEntryQrTitle}
            onBackdropClick={props.onClose}
        >
            <button aria-label="关闭" className="desktop-pairing-close" onClick={props.onClose} type="button">
                <CloseIcon />
            </button>
            {props.entry && qrCode ? (
                <div className="desktop-pairing-grid">
                    <div className="desktop-pairing-qr">
                        <div className="desktop-pairing-image" aria-label={props.copy.lanEntryQrTitle} role="img">
                            <svg viewBox={qrCode.viewBox} className="desktop-pairing-svg" aria-hidden="true">
                                <path d={qrCode.path} />
                            </svg>
                        </div>
                    </div>
                    <div className="desktop-pairing-side">
                        <div className="desktop-pairing-code is-bound">
                            <LinkIcon />
                            <strong>{props.copy.lanEntryQrCode}</strong>
                        </div>
                        <p className="desktop-pairing-guidance">{props.copy.lanEntryQrGuidance}</p>
                    </div>
                </div>
            ) : null}
        </ModalLayer>
    )
}
