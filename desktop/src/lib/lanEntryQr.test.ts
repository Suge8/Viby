import { describe, expect, it } from 'bun:test'
import type { EntryPreviewModel } from './entryMode'
import { buildLanEntryQrModel } from './lanEntryQr'

const lanEntry: EntryPreviewModel = {
    mode: 'lan',
    displayLabel: '局域网地址',
    displayValue: '192.168.1.8:37173',
    openUrl: 'http://192.168.1.8:37173',
    isPreview: false,
}

describe('lanEntryQr', () => {
    it('uses the LAN entry only when public access is off', () => {
        expect(buildLanEntryQrModel({ entryPreview: lanEntry, publicAccessEnabled: false })).toEqual({
            url: 'http://192.168.1.8:37173',
            displayValue: '192.168.1.8:37173',
        })
        expect(buildLanEntryQrModel({ entryPreview: lanEntry, publicAccessEnabled: true })).toBeNull()
    })

    it('hides the QR when only local loopback is available', () => {
        expect(
            buildLanEntryQrModel({
                entryPreview: {
                    ...lanEntry,
                    mode: 'local',
                    displayValue: '127.0.0.1:37173',
                    openUrl: 'http://127.0.0.1:37173',
                },
                publicAccessEnabled: false,
            })
        ).toBeNull()
    })

    it('hides the QR before the runtime publishes an openable address', () => {
        expect(
            buildLanEntryQrModel({
                entryPreview: { ...lanEntry, openUrl: undefined, isPreview: true },
                publicAccessEnabled: false,
            })
        ).toBeNull()
    })
})
