import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import {
    COMPOSER_INPUT_SELECTOR,
    COMPOSER_PRIMARY_ACTION_BUTTON_SELECTOR,
    SESSION_CHAT_COMPOSER_STAGE_SELECTOR,
    SESSION_CHAT_VIEWPORT_SELECTOR,
    THREAD_BOTTOM_CONTROL_SELECTOR,
    TRANSCRIPT_ROW_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'

type ChatBottomAnchorMeasurement = {
    bottomAnchorTop: number
    bottomButtonVisible: boolean
    lastRowBottom: number
    maxOffset: number
    restingGap: number
    scrollTop: number
}

const BOTTOM_DELTA_TOLERANCE_PX = 2
const RESTING_BOTTOM_TOLERANCE_PX = 2
const LEAVE_BOTTOM_SCROLL_DELTA_PX = -720

export async function assertChatBottomAnchorBehavior(options: {
    outputDir: string
    page: Page
    settleTimeoutMs: number
}): Promise<void> {
    const measurements: Record<string, ChatBottomAnchorMeasurement> = {}

    await waitForRestingBottom(options.page, options.settleTimeoutMs)
    measurements.entry = await captureMeasurement(options, 'chat-bottom-entry', 'resting')

    const viewport = options.page.locator(SESSION_CHAT_VIEWPORT_SELECTOR).first()
    await viewport.evaluate((node, deltaPx) => {
        if (!(node instanceof HTMLDivElement)) {
            throw new Error('Chat viewport missing for leave-bottom scroll')
        }

        node.dispatchEvent(
            new WheelEvent('wheel', {
                deltaY: deltaPx,
                bubbles: true,
                cancelable: true,
            })
        )
        node.scrollBy(0, deltaPx)
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
    }, LEAVE_BOTTOM_SCROLL_DELTA_PX)
    await waitForBottomControlVisible(options.page, options.settleTimeoutMs)
    measurements.afterLeaveBottom = await captureMeasurement(options, 'chat-bottom-after-leave', 'away')

    await options.page.locator(THREAD_BOTTOM_CONTROL_SELECTOR).first().click()
    await waitForRestingBottom(options.page, options.settleTimeoutMs)
    measurements.afterBottomCta = await captureMeasurement(options, 'chat-bottom-after-cta', 'resting')

    await options.page.locator(COMPOSER_INPUT_SELECTOR).first().fill('browser smoke bottom anchor send')
    await options.page.locator(COMPOSER_PRIMARY_ACTION_BUTTON_SELECTOR).first().click()
    await waitForRestingBottom(options.page, options.settleTimeoutMs)
    measurements.afterSend = await captureMeasurement(options, 'chat-bottom-after-send', 'resting')

    writeFileSync(
        join(options.outputDir, 'chat-bottom-anchor-summary.json'),
        `${JSON.stringify(measurements, null, 2)}\n`
    )
}

async function captureMeasurement(
    options: { outputDir: string; page: Page },
    label: string,
    expectation: 'away' | 'resting'
): Promise<ChatBottomAnchorMeasurement> {
    const measurement = await readChatBottomAnchorMeasurement(options.page)
    assertMeasurement(measurement, label, expectation)
    await options.page.screenshot({ path: join(options.outputDir, `${label}.png`) })
    writeFileSync(join(options.outputDir, `${label}.json`), `${JSON.stringify(measurement, null, 2)}\n`)
    return measurement
}

function assertMeasurement(
    measurement: ChatBottomAnchorMeasurement,
    label: string,
    expectation: 'away' | 'resting'
): void {
    const bottomDelta = measurement.bottomAnchorTop - measurement.lastRowBottom
    if (expectation === 'away') {
        if (!measurement.bottomButtonVisible) {
            throw new Error(`${label}: bottom CTA stayed hidden after the user left the resting bottom`)
        }
        if (measurement.maxOffset - measurement.scrollTop <= RESTING_BOTTOM_TOLERANCE_PX) {
            throw new Error(`${label}: transcript never actually left the resting bottom`)
        }
        return
    }

    if (measurement.maxOffset - measurement.scrollTop > RESTING_BOTTOM_TOLERANCE_PX) {
        throw new Error(
            `${label}: resting bottom transaction stopped early (scrollTop=${measurement.scrollTop}, maxOffset=${measurement.maxOffset})`
        )
    }

    if (measurement.bottomButtonVisible) {
        throw new Error(`${label}: bottom CTA stayed visible after the transcript returned to the resting bottom`)
    }

    if (Math.abs(bottomDelta - measurement.restingGap) > BOTTOM_DELTA_TOLERANCE_PX) {
        throw new Error(
            `${label}: transcript resting bottom drifted away from the defined composer gap (bottomDelta=${bottomDelta}, restingGap=${measurement.restingGap})`
        )
    }
}

export async function waitForRestingBottom(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
        ({ bottomAnchorSelector, bottomControlSelector, rowSelector, tolerancePx, viewportSelector }) => {
            function readLengthPx(scope: HTMLElement, rawValue: string): number {
                const value = rawValue.trim()
                if (value.length === 0) {
                    return 0
                }

                const probe = document.createElement('div')
                probe.style.position = 'absolute'
                probe.style.visibility = 'hidden'
                probe.style.pointerEvents = 'none'
                probe.style.marginTop = value
                scope.appendChild(probe)
                const px = Math.round(Number.parseFloat(getComputedStyle(probe).marginTop) || 0)
                probe.remove()
                return px
            }

            const viewport = document.querySelector(viewportSelector)
            const bottomAnchor = document.querySelector(bottomAnchorSelector)
            const bottomButton = document.querySelector(bottomControlSelector)
            const layout = bottomAnchor?.closest('.session-chat-layout')
            const rows =
                viewport instanceof HTMLDivElement ? [...viewport.querySelectorAll<HTMLElement>(rowSelector)] : []
            const lastRow = rows.at(-1)
            if (
                !(viewport instanceof HTMLDivElement) ||
                !(bottomAnchor instanceof HTMLElement) ||
                !(lastRow instanceof HTMLElement)
            ) {
                return false
            }

            const maxOffset = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
            const bottomDelta = bottomAnchor.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom
            const restingGap = readLengthPx(
                layout instanceof HTMLElement ? layout : document.body,
                getComputedStyle(layout ?? document.documentElement).getPropertyValue(
                    '--chat-composer-visual-clearance'
                )
            )
            const bottomButtonVisible =
                bottomButton instanceof HTMLButtonElement &&
                !bottomButton.disabled &&
                bottomButton.getAttribute('aria-hidden') !== 'true'

            return (
                maxOffset - viewport.scrollTop <= tolerancePx &&
                Math.abs(bottomDelta - restingGap) <= tolerancePx &&
                !bottomButtonVisible
            )
        },
        {
            bottomAnchorSelector: SESSION_CHAT_COMPOSER_STAGE_SELECTOR,
            bottomControlSelector: THREAD_BOTTOM_CONTROL_SELECTOR,
            rowSelector: TRANSCRIPT_ROW_SELECTOR,
            tolerancePx: RESTING_BOTTOM_TOLERANCE_PX,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        },
        { timeout: timeoutMs }
    )
}

async function waitForBottomControlVisible(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
        ({ bottomControlSelector }) => {
            const button = document.querySelector(bottomControlSelector)
            return (
                button instanceof HTMLButtonElement && !button.disabled && button.getAttribute('aria-hidden') !== 'true'
            )
        },
        { bottomControlSelector: THREAD_BOTTOM_CONTROL_SELECTOR },
        { timeout: timeoutMs }
    )
}

async function readChatBottomAnchorMeasurement(page: Page): Promise<ChatBottomAnchorMeasurement> {
    return await page.evaluate(
        ({ bottomAnchorSelector, bottomControlSelector, rowSelector, viewportSelector }) => {
            function readLengthPx(scope: HTMLElement, rawValue: string): number {
                const value = rawValue.trim()
                if (value.length === 0) {
                    return 0
                }

                const probe = document.createElement('div')
                probe.style.position = 'absolute'
                probe.style.visibility = 'hidden'
                probe.style.pointerEvents = 'none'
                probe.style.marginTop = value
                scope.appendChild(probe)
                const px = Math.round(Number.parseFloat(getComputedStyle(probe).marginTop) || 0)
                probe.remove()
                return px
            }

            const viewport = document.querySelector(viewportSelector)
            const bottomAnchor = document.querySelector(bottomAnchorSelector)
            const rows =
                viewport instanceof HTMLDivElement ? [...viewport.querySelectorAll<HTMLElement>(rowSelector)] : []
            const lastRow = rows.at(-1)
            const bottomButton = document.querySelector(bottomControlSelector)
            const layout = bottomAnchor?.closest('.session-chat-layout')
            if (
                !(viewport instanceof HTMLDivElement) ||
                !(bottomAnchor instanceof HTMLElement) ||
                !(lastRow instanceof HTMLElement)
            ) {
                throw new Error('Chat bottom anchor measurement surface missing')
            }

            return {
                bottomAnchorTop: Math.round(bottomAnchor.getBoundingClientRect().top),
                bottomButtonVisible:
                    bottomButton instanceof HTMLButtonElement &&
                    !bottomButton.disabled &&
                    bottomButton.getAttribute('aria-hidden') !== 'true',
                lastRowBottom: Math.round(lastRow.getBoundingClientRect().bottom),
                maxOffset: Math.round(Math.max(0, viewport.scrollHeight - viewport.clientHeight)),
                restingGap: readLengthPx(
                    layout instanceof HTMLElement ? layout : document.body,
                    getComputedStyle(layout ?? document.documentElement).getPropertyValue(
                        '--chat-composer-visual-clearance'
                    )
                ),
                scrollTop: Math.round(viewport.scrollTop),
            }
        },
        {
            bottomAnchorSelector: SESSION_CHAT_COMPOSER_STAGE_SELECTOR,
            bottomControlSelector: THREAD_BOTTOM_CONTROL_SELECTOR,
            rowSelector: TRANSCRIPT_ROW_SELECTOR,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        }
    )
}
