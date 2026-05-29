import type { JSX } from 'react'
import { ModalLayer } from '@/components/motion'
import { PairingCard, type PairingInviteLike } from '@/components/PairingCard'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { PairingBridgeState } from '@/types'

export function DesktopPairingModal(props: {
    copy: DesktopCopy
    open: boolean
    pairing: PairingInviteLike | null
    pairingBridge: PairingBridgeState
    showQr?: boolean
    onClose(): void
    onCopyCode?: (code: string) => void
    onCopyLink?: (url: string) => void
}): JSX.Element {
    const isCompact = props.showQr === false
    return (
        <ModalLayer
            open={Boolean(props.pairing && props.open)}
            backdropClassName="desktop-pairing-backdrop"
            cardClassName={`desktop-pairing-card${isCompact ? ' is-compact' : ''}`}
            label={props.copy.deviceTitle}
            onBackdropClick={props.onClose}
        >
            {props.pairing ? (
                <PairingCard
                    bridgeState={props.pairingBridge}
                    onCopyCode={props.onCopyCode}
                    onCopyLink={props.onCopyLink}
                    onDismiss={props.onClose}
                    pairing={props.pairing}
                    showQr={props.showQr ?? true}
                />
            ) : null}
        </ModalLayer>
    )
}
