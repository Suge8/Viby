# 设备 presence 单一事实源

## 产品语义

桌面是多设备 host，一台电脑可同时绑多台手机。点二维码按钮 = “再加一台设备”，总是创建新的独立 pairing session，不影响已连设备。

每个 paired 设备都有独立的：

- `pairingId` / `hostToken`（broker session）
- desktop persistence 条目
- `PairingBridgeController` 实例
- hub `device_auth_devices` 一行

## 当前事实源

`device.active` 分两类：

- `local` / `link`：Hub `DevicePresenceTracker`，由 Socket.IO web namespace 连接维护。
- `scan`：desktop `usePairingBridges` 的 bridge phase；只有 `phase='ready'` 算在线。

Hub 只保存 scan 设备元数据，不再维护 scan 在线状态。`pairing:<id>` 即使出现在 Hub presence 里也会被忽略。

## 数据契约

### `device_auth_devices`

| 字段 | 用途 |
|------|------|
| `last_seen_at` | 仅 UI 显示“上次在线”，不参与 active 判定 |
| `revoked_at` | 仅 `channel='link'` 设备使用；scan 设备取消配对走硬删 |
| `channel='scan'` | Hub 保存元数据；在线状态由 desktop bridge map 判定 |

### Hub `isActiveDevice`

```ts
function isActiveDevice(device, activeIds): boolean {
    if (device.revokedAt !== null) return false
    if (device.channel === 'scan') return false
    return activeIds.has(device.id)
}
```

### Desktop `getConnectedDevices`

```ts
scan device active ⇔ deviceLinks.get(device.id)?.phase === 'ready'
link/local active ⇔ device.active && revokedAt === null
```

## HTTP 协议

### 已退役：`POST /api/device-auth/pairing-presence`

该路由已删除。桌面端不再向 Hub 上报 scan presence。

### `DELETE /api/device-auth/devices/:deviceId`

- `pairing:<X>` / `channel='scan'` → 硬删
- 其他设备 → soft revoke（`revoked_at = now`）

## 桌面端 UI

Device popover 合并两份事实：

- Hub `device_auth_devices`：设备列表、名称、平台、link/local active。
- `usePairingBridges().deviceLinks`：scan 设备在线与链路质量。

展示规则：

- `ready` + direct/relay stats → “点对点直连/安全中转 + 延迟”
- `connecting` → “正在握手”
- `fatal` → “连接中断”
- 没有 bridge ready 的 scan row → 不计入在线数量

## 取消配对端到端

```text
用户点取消
  └─► desktop revokeDeviceAction
        ├─► DELETE /api/device-auth/devices/pairing:<X>  ─► hub 硬删 scan row
        ├─► DELETE broker /pairings/<X>                  ─► broker emit expired
        └─► clearPairing                                 ─► bridge dispose
```

## 迁移策略

`SCHEMA_VERSION` 19 → 20：

1. 删除 `revoked_at IS NOT NULL` 的历史 tombstone。
2. 删除历史 `channel='scan'` 行；后续 scan 元数据由当前 pairing bind 路径重建。

## 已删除旧路径

- `desktop/src/lib/pairingPresenceSync.ts`
- `LocalHubPairingClient.reportPairingPresence()`
- `PairingPresenceSink`
- `POST /api/device-auth/pairing-presence`
