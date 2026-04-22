import QRCode from 'qrcode'
import { type JSX, useEffect, useState } from 'react'
import { ControlPill } from '@/components/ControlPill'
import { formatTimestamp } from '@/lib/format'
import { describePairingTransport } from '@/lib/pairingBridgeSupport'
import type { DesktopPairingSession, PairingBridgeState, PairingSessionSnapshot } from '@/types'

export interface PairingCardActions {
    onCopyLink: () => void
    onApprove: () => void
    onRejectAndRefresh: () => void
    onRefresh: () => void
    onClear: () => void
}

interface PairingCardProps {
    pairing: DesktopPairingSession
    bridgeState: PairingBridgeState
    busy: boolean
    actions: PairingCardActions
}

function getApprovalLabel(snapshot: PairingSessionSnapshot): string {
    if (!snapshot.guest) {
        return '等待扫码'
    }

    if (snapshot.approvalStatus === 'approved') {
        return '已批准'
    }

    return '待确认'
}

function PairingCardComponent({ pairing, bridgeState, busy, actions }: PairingCardProps): JSX.Element {
    const [qrDataUrl, setQrDataUrl] = useState<string>('')
    const snapshot: PairingSessionSnapshot = bridgeState.pairing ?? pairing.pairing
    const approvalPending = Boolean(snapshot.guest && snapshot.approvalStatus === 'pending')

    useEffect(() => {
        let cancelled = false

        void QRCode.toDataURL(pairing.pairingUrl, {
            margin: 1,
            width: 220,
            errorCorrectionLevel: 'M',
        })
            .then((nextUrl) => {
                if (!cancelled) {
                    setQrDataUrl(nextUrl)
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setQrDataUrl('')
                }
            })

        return () => {
            cancelled = true
        }
    }, [pairing.pairingUrl])

    return (
        <section className="desktop-pairing-card">
            <div className="desktop-pairing-copy">
                <p className="desktop-eyebrow">手机配对</p>
                <h2>扫一下。继续用。</h2>
                <p>二维码是副路径，不打断主控制流。第一次扫码消费票据，之后会自动回到这台机器。</p>
            </div>

            <div className="desktop-pairing-grid">
                <div className="desktop-pairing-qr">
                    {qrDataUrl ? (
                        <img alt="Pairing QR code" className="desktop-pairing-image" src={qrDataUrl} />
                    ) : (
                        <div className="desktop-pairing-placeholder">生成二维码中…</div>
                    )}
                </div>

                <div className="desktop-pairing-meta">
                    <div className="desktop-pairing-meta-card">
                        <span>配对 ID</span>
                        <strong>{snapshot.id}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>票据过期</span>
                        <strong>{formatTimestamp(snapshot.ticketExpiresAt)}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>批准状态</span>
                        <strong>{getApprovalLabel(snapshot)}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>确认码</span>
                        <strong>{snapshot.shortCode ?? '待生成'}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>手机设备</span>
                        <strong>{snapshot.guest?.label ?? '还没有设备接入'}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>桥接状态</span>
                        <strong>{bridgeState.message ?? '等待手机接入。'}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>传输路径</span>
                        <strong>{describePairingTransport(bridgeState.stats ?? null)}</strong>
                    </div>
                    <div className="desktop-pairing-meta-card">
                        <span>恢复次数</span>
                        <strong>{bridgeState.stats?.restartCount ?? 0}</strong>
                    </div>
                </div>
            </div>

            <div className="desktop-dock">
                {approvalPending ? (
                    <>
                        <ControlPill disabled={busy} label="批准接入" onClick={actions.onApprove} />
                        <ControlPill disabled={busy} label="拒绝并刷新" onClick={actions.onRejectAndRefresh} />
                    </>
                ) : null}
                <ControlPill disabled={busy} label="复制配对链接" onClick={actions.onCopyLink} />
                <ControlPill disabled={busy} label="刷新二维码" onClick={actions.onRefresh} />
                <ControlPill disabled={busy} label="结束配对" onClick={actions.onClear} />
            </div>
        </section>
    )
}

export const PairingCard = PairingCardComponent
