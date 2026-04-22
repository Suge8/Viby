import { describe, expect, it, mock } from 'bun:test'
import type { HubSnapshot } from '../types'
import { buildFooterMessage, buildOverviewFields, buildPrimaryActionLabel, buildStatusCopy } from './panelContent'

function createSnapshot(overrides: Partial<HubSnapshot> = {}): HubSnapshot {
    return {
        running: false,
        managed: false,
        logPath: '/tmp/desktop.log',
        startupConfig: {
            listenHost: '127.0.0.1',
            listenPort: 37173,
        },
        ...overrides,
    }
}

describe('panelContent', () => {
    it('prefers action errors in the footer message', () => {
        const message = buildFooterMessage(
            '操作失败',
            createSnapshot(),
            { managed: false, running: false, ready: false, booting: false, displayedPhase: undefined },
            {
                mode: 'local',
                displayLabel: '启动后地址',
                displayValue: 'http://127.0.0.1:37173',
                copyValue: 'http://127.0.0.1:37173',
                isPreview: true,
            }
        )

        expect(message).toBe('操作失败')
    })

    it('returns a managed ready status copy', () => {
        const copy = buildStatusCopy({
            managed: true,
            running: true,
            ready: true,
            booting: false,
            displayedPhase: 'ready',
        })

        expect(copy).toEqual({
            title: '运行中',
            subtitle: '入口已经准备好，关上窗口只会隐藏到状态栏。',
            chip: '本窗口托管',
        })
    })

    it('uses the starting label only while a stopped hub is busy', () => {
        expect(
            buildPrimaryActionLabel(
                { managed: false, running: false, ready: false, booting: false, displayedPhase: undefined },
                true
            )
        ).toBe('正在开启')

        expect(
            buildPrimaryActionLabel(
                { managed: true, running: true, ready: false, booting: true, displayedPhase: 'starting' },
                true
            )
        ).toBe('停止中枢')
    })

    it('exposes copy actions only when values exist', () => {
        const copyValue = mock(async () => undefined)
        const fields = buildOverviewFields({
            entryPreview: {
                mode: 'local',
                displayLabel: '当前地址',
                displayValue: 'http://127.0.0.1:37173',
                copyValue: 'http://127.0.0.1:37173',
                openUrl: 'http://127.0.0.1:37173',
                isPreview: false,
            },
            status: undefined,
            copyValue,
        })

        expect(fields[0]?.actionLabel).toBe('复制')
        expect(fields[1]?.actionLabel).toBeUndefined()
    })
})
