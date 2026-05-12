import type { PairingDeviceLinkStatus } from '@viby/protocol/pairing'
import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import type { DeviceAuthDevice } from '@/lib/deviceAuthSummary'
import { formatDevicePlatform, formatDeviceTitle } from '@/lib/deviceDisplay'
import { buildDeviceLinkStatus, type DeviceLinkSnapshotMap } from '@/lib/deviceLinkBadge'
import { getConnectedDevices } from '@/lib/deviceListPresentation'

const DEVICE_POPOVER_CLOSE_DELAY_MS = 160

function buildDeviceHeadline(device: DeviceAuthDevice, linkStatus: PairingDeviceLinkStatus): string {
    const title = formatDeviceTitle({ name: device.name, platform: device.platform, channel: device.channel })
    return `${title} / ${linkStatus.title}`
}

function DeviceRow(props: {
    device: DeviceAuthDevice
    links: DeviceLinkSnapshotMap
    onRevokeDevice(deviceId: string): void
    revoking: boolean
}): JSX.Element {
    const { device } = props
    const { icon } = formatDevicePlatform(device.platform)
    const linkStatus = buildDeviceLinkStatus(device, props.links.get(device.id) ?? null)
    return (
        <div className="desktop-device-row">
            <span className={`desktop-device-dot is-${linkStatus.tone}`} />
            <span className="desktop-device-icon" aria-hidden="true">
                {icon}
            </span>
            <div>
                <strong>{buildDeviceHeadline(device, linkStatus)}</strong>
                <small>当前在线</small>
            </div>
            <button type="button" disabled={props.revoking} onClick={() => props.onRevokeDevice(device.id)}>
                {props.revoking ? '取消中…' : '取消配对'}
            </button>
        </div>
    )
}

function DeviceListPopover(props: {
    devices: DeviceAuthDevice[]
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
    devices: DeviceAuthDevice[]
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
                <span>台设备已连接</span>
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
