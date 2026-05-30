# 设备 presence 单一事实源

## 产品语义

桌面是多设备 host，一台电脑可同时绑多台手机。点二维码按钮 = “再加一台设备”，总是创建新的独立 pairing session，不影响已连设备。

每个 paired 设备都有独立的：

- `pairingId` / `hostToken`（broker session）
- desktop persistence 条目
- `PairingBridgeController` 实例
- 可选 hub `device_auth_devices` 元数据行；UI 不等待这行存在才承认 live scan bridge

## 当前事实源

`device.active` 分两类：

- `local` / `link`：Hub `DevicePresenceTracker`，由 Socket.IO web namespace 连接维护。
- `scan`：broker / Hub pairing owner 暴露的 `remoteConnections`；同一 `pairing:<id>` 下多 tab / PWA / 窗口聚合为一台设备。

Hub 只保存 scan 设备元数据，不再维护 scan 在线状态。`pairing:<id>` 即使出现在 Hub presence 里也会被忽略。

Desktop 设备列表投影以 persisted pairings + `remoteConnections` 作为 scan 设备事实源：`pairing:<id>` row 总是由当前 pairing snapshot 覆盖，Hub rows 只补 link/local 和历史非 scan 元数据。这样浏览器 tab 安装成 PWA 后，即使 standalone storage 变成新分区，也仍然落在同一个 `pairing:<id>` 逻辑设备；多个窗口只增加展开层连接数，不增加主层设备数。

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
scan device active ⇔ remoteConnections.some(connection.connectedAt !== undefined)
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
- Desktop persisted pairings：scan row 的 canonical 元数据与逻辑设备 id。
- Broker / Hub pairing `remoteConnections`：scan 设备当前在线窗口、窗口数、每个窗口在线/离线状态。
- `usePairingBridges().deviceLinks`：链路质量；route 状态事件驱动更新，RTT 只显示带 `sampledAt` 且未过期的观测样本。

展示规则：

- `ready` + direct/relay stats → “点对点直连/安全中转 + 延迟”；RTT 样本过期时保留 transport，隐藏旧延迟数字。
- `connecting` → “正在握手”
- `fatal` → “连接中断”
- 没有 online remote connection 的 scan row → 不计入在线数量

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
