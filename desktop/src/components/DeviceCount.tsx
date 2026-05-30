import { describePairingDirectBlockedReason, type PairingDeviceLinkStatus } from '@viby/protocol/pairing'
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { formatDevicePlatform, formatDeviceTitle } from '@/lib/deviceDisplay'
import { buildDeviceLinkStatus, type DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import { getConnectedDevices, type PresentedDevice } from '@/lib/deviceListPresentation'

const DEVICE_POPOVER_CLOSE_DELAY_MS = 160

function buildDeviceHeadline(device: PresentedDevice): string {
    return formatDeviceTitle({ name: device.name, platform: device.platform, channel: device.channel })
}

function buildDeviceLinkDetail(
    device: PresentedDevice,
    links: DeviceLinkSnapshotMap,
    status: PairingDeviceLinkStatus
): string {
    const connectionCount = device.remoteConnections?.length ?? 0
    if (connectionCount > 0) return `${connectionCount} 个窗口 · ${status.title}`
    const reason = describePairingDirectBlockedReason(links.get(device.id)?.stats?.directBlockedReason)
    return reason ? `${status.title} · ${reason}` : status.title
}

function RemoteConnectionList(props: { device: PresentedDevice }): JSX.Element | null {
    if (!props.device.remoteConnections?.length) return null
    return (
        <div className="desktop-device-connections">
            {props.device.remoteConnections.map((connection, index) => (
                <span key={connection.id}>
                    窗口 {index + 1}: {connection.connectedAt === undefined ? '离线' : '在线'}
                </span>
            ))}
        </div>
    )
}

function DeviceRow(props: {
    device: PresentedDevice
    links: DeviceLinkSnapshotMap
    onRevokeDevice(deviceId: string): void
    revoking: boolean
}): JSX.Element {
    const { device } = props
    const { icon } = formatDevicePlatform(device.platform)
    const linkStatus = buildDeviceLinkStatus(device, props.links.get(device.id) ?? null)
    const linkDetail = buildDeviceLinkDetail(device, props.links, linkStatus)
    return (
        <div className="desktop-device-row">
            <span className={`desktop-device-dot is-${linkStatus.tone}`} />
            <span className="desktop-device-icon" aria-hidden="true">
                {icon}
            </span>
            <div>
                <strong>{buildDeviceHeadline(device)}</strong>
                <small>{linkDetail}</small>
                <RemoteConnectionList device={device} />
            </div>
            <button type="button" disabled={props.revoking} onClick={() => props.onRevokeDevice(device.id)}>
                {props.revoking ? '取消中…' : '取消配对'}
            </button>
        </div>
    )
}

function DeviceListPopover(props: {
    devices: PresentedDevice[]
    links: DeviceLinkSnapshotMap
    revokingId: string | null
    onRevokeDevice(deviceId: string): void
}): JSX.Element {
    const activeDevices = getConnectedDevices(props.devices)
    return (
        <div className="desktop-device-popover" role="listbox" aria-live="polite">
            {activeDevices.length === 0 ? <span className="desktop-device-popover-empty">暂无在线设备</span> : null}
            {activeDevices.map((device) => (
                <DeviceRow
                    key={device.id}
                    device={device}
                    links={props.links}
                    revoking={props.revokingId === device.id}
                    onRevokeDevice={props.onRevokeDevice}
                />
            ))}
        </div>
    )
}

function useDevicePopover(): {
    open: boolean
    show(): void
    scheduleHide(): void
    close(): void
    toggle(): void
} {
    const [open, setOpen] = useState(false)
    const timerRef = useRef<number | null>(null)

    const cancelHide = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current)
            timerRef.current = null
        }
    }, [])

    const show = useCallback(() => {
        cancelHide()
        setOpen(true)
    }, [cancelHide])

    const scheduleHide = useCallback(() => {
        cancelHide()
        timerRef.current = window.setTimeout(() => {
            setOpen(false)
            timerRef.current = null
        }, DEVICE_POPOVER_CLOSE_DELAY_MS)
    }, [cancelHide])

    const close = useCallback(() => {
        cancelHide()
        setOpen(false)
    }, [cancelHide])

    const toggle = useCallback(() => {
        cancelHide()
        setOpen((prev) => !prev)
    }, [cancelHide])

    useEffect(() => () => cancelHide(), [cancelHide])

    return { open, show, scheduleHide, close, toggle }
}

export function DeviceCount(props: {
    count: number
    devices: PresentedDevice[]
    links: DeviceLinkSnapshotMap
    onRevokeDevice(deviceId: string): void | Promise<void>
}): JSX.Element {
    const popover = useDevicePopover()
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const handleRevoke = useCallback(
        async (deviceId: string) => {
            if (revokingId) return
            setRevokingId(deviceId)
            try {
                await props.onRevokeDevice(deviceId)
            } finally {
                setRevokingId(null)
            }
        },
        [props, revokingId]
    )
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
        if (event.key === 'Escape' && popover.open) {
            event.stopPropagation()
            popover.close()
        }
    }
    return (
        <div
            className={popover.open ? 'desktop-device-count-wrap is-open' : 'desktop-device-count-wrap'}
            onMouseEnter={popover.show}
            onMouseLeave={popover.scheduleHide}
            onFocusCapture={popover.show}
            onBlurCapture={popover.scheduleHide}
            onKeyDown={handleKeyDown}
        >
            <button
                className={props.count > 0 ? 'desktop-device-count is-active' : 'desktop-device-count'}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={popover.open}
                onClick={popover.toggle}
            >
                <strong>{props.count}</strong>
                <span>台设备在线</span>
            </button>
            <DeviceListPopover
                devices={props.devices}
                links={props.links}
                revokingId={revokingId}
                onRevokeDevice={handleRevoke}
            />
        </div>
    )
}
