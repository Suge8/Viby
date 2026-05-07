import type { JSX } from 'react'
import { ModalLayer } from '@/components/motion'
import { PairingCard } from '@/components/PairingCard'
import type { DesktopCopy } from '@/lib/desktopCopy'
import type { DesktopPairingSession, PairingBridgeState } from '@/types'

export function DesktopPairingModal(props: {
    copy: DesktopCopy
    open: boolean
    pairing: DesktopPairingSession | null
    pairingBridge: PairingBridgeState
    onClose(): void
}): JSX.Element {
    return (
        <ModalLayer
            open={Boolean(props.pairing && props.open)}
            backdropClassName="desktop-pairing-backdrop"
            cardClassName="desktop-pairing-card"
            label={props.copy.phoneTitle}
            onBackdropClick={props.onClose}
        >
            {props.pairing ? (
                <PairingCard bridgeState={props.pairingBridge} onDismiss={props.onClose} pairing={props.pairing} />
            ) : null}
        </ModalLayer>
    )
}
