import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright-core'
import {
    SESSION_CHAT_HEADER_STAGE_SELECTOR,
    SESSION_CHAT_VIEWPORT_SELECTOR,
    THREAD_BOTTOM_CONTROL_SELECTOR,
    THREAD_HISTORY_CONTROL_SELECTOR,
    TRANSCRIPT_JUMP_TARGET_ROW_SELECTOR,
    TRANSCRIPT_ROW_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'
import { waitForRestingBottom } from './appLikeChatBottomAnchorSupport'

type ChatTopAnchorMeasurement = {
    bottomButtonVisible: boolean
    headerBottom: number
    scrollTop: number
    topAnchorGap: number
    topRowTop: number
    topJumpTargetRowTop: number | null
}

const TOP_ANCHOR_TOLERANCE_PX = 2
const TOP_OVERLAY_SCROLL_DELTA_PX = 220
const TOP_ANCHOR_PRECONDITION_TIMEOUT_MULTIPLIER = 3

export async function assertChatTopAnchorBehavior(options: {
    outputDir: string
    page: Page
    settleTimeoutMs: number
}): Promise<void> {
    await options.page.waitForTimeout(1_000)
    await waitForRestingBottom(options.page, options.settleTimeoutMs * TOP_ANCHOR_PRECONDITION_TIMEOUT_MULTIPLIER)
    await options.page.locator(THREAD_HISTORY_CONTROL_SELECTOR).first().click()
    await waitForTopAnchor(options.page, options.settleTimeoutMs)
    await waitForTopAnchorIdle(options.page, options.settleTimeoutMs)
    const anchored = await captureMeasurement(options, 'chat-top-after-history-jump', 'anchored')

    await scrollViewportToCurrentWindowStart(options.page)
    await waitForTopRestingCeiling(options.page, options.settleTimeoutMs)
    const resting = await captureMeasurement(options, 'chat-top-after-manual-rest', 'resting')

    await options.page
        .locator(SESSION_CHAT_VIEWPORT_SELECTOR)
        .first()
        .evaluate((node, deltaPx) => {
            if (!(node instanceof HTMLDivElement)) {
                throw new Error('Chat viewport missing for top-anchor overlay scroll')
            }

            node.dispatchEvent(
                new WheelEvent('wheel', {
                    deltaY: deltaPx,
                    bubbles: true,
                    cancelable: true,
                })
            )
            node.scrollBy(0, deltaPx)
        }, TOP_OVERLAY_SCROLL_DELTA_PX)

    await waitForTopOverlayScroll(options.page, options.settleTimeoutMs)
    const overlayed = await captureMeasurement(options, 'chat-top-after-manual-scroll', 'overlayed')
    await options.page.locator(THREAD_BOTTOM_CONTROL_SELECTOR).first().click()
    await waitForRestingBottom(options.page, options.settleTimeoutMs * TOP_ANCHOR_PRECONDITION_TIMEOUT_MULTIPLIER)

    writeFileSync(
        join(options.outputDir, 'chat-top-anchor-summary.json'),
        `${JSON.stringify({ anchored, resting, overlayed }, null, 2)}\n`
    )
}

async function captureMeasurement(
    options: { outputDir: string; page: Page },
    label: string,
    expectation: 'anchored' | 'overlayed' | 'resting'
): Promise<ChatTopAnchorMeasurement> {
    const measurement = await readChatTopAnchorMeasurement(options.page)
    assertMeasurement(measurement, label, expectation)
    await options.page.screenshot({ path: join(options.outputDir, `${label}.png`) })
    writeFileSync(join(options.outputDir, `${label}.json`), `${JSON.stringify(measurement, null, 2)}\n`)
    return measurement
}

function assertMeasurement(
    measurement: ChatTopAnchorMeasurement,
    label: string,
    expectation: 'anchored' | 'overlayed' | 'resting'
): void {
    if (expectation === 'overlayed') {
        if (measurement.topRowTop >= measurement.headerBottom) {
            throw new Error(`${label}: manual upward scroll never let transcript rows pass behind the floating header`)
        }
        return
    }

    if (expectation === 'resting') {
        if (Math.abs(measurement.scrollTop) > TOP_ANCHOR_TOLERANCE_PX) {
            throw new Error(
                `${label}: manual top resting ceiling never settled at scrollTop=0 (scrollTop=${measurement.scrollTop})`
            )
        }
        const topDelta = measurement.topRowTop - measurement.headerBottom
        if (Math.abs(topDelta - measurement.topAnchorGap) > TOP_ANCHOR_TOLERANCE_PX) {
            throw new Error(
                `${label}: manual top resting ceiling drifted away from the defined header gap (topDelta=${topDelta}, topAnchorGap=${measurement.topAnchorGap})`
            )
        }
        return
    }

    if (!measurement.bottomButtonVisible) {
        throw new Error(`${label}: bottom CTA stayed hidden after the history jump left the resting bottom`)
    }
    if (measurement.topJumpTargetRowTop === null) {
        throw new Error(`${label}: history jump did not reveal a visible jump-target row anchor`)
    }

    const topDelta = measurement.topJumpTargetRowTop - measurement.headerBottom
    if (Math.abs(topDelta - measurement.topAnchorGap) > TOP_ANCHOR_TOLERANCE_PX) {
        throw new Error(
            `${label}: history jump reveal drifted away from the defined header gap (topDelta=${topDelta}, topAnchorGap=${measurement.topAnchorGap})`
        )
    }
}

async function scrollViewportToCurrentWindowStart(page: Page): Promise<void> {
    await page
        .locator(SESSION_CHAT_VIEWPORT_SELECTOR)
        .first()
        .evaluate(async (node) => {
            if (!(node instanceof HTMLDivElement)) {
                throw new Error('Chat viewport missing for top resting ceiling scroll')
            }

            node.dispatchEvent(
                new WheelEvent('wheel', {
                    deltaY: -node.scrollHeight,
                    bubbles: true,
                    cancelable: true,
                })
            )
            node.scrollTo({ top: 0, behavior: 'auto' })
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            node.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
}

async function waitForTopRestingCeiling(page: Page, timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const measurement = await readChatTopAnchorMeasurement(page)
        const topDelta = measurement.topRowTop - measurement.headerBottom
        if (
            Math.abs(measurement.scrollTop) <= TOP_ANCHOR_TOLERANCE_PX &&
            Math.abs(topDelta - measurement.topAnchorGap) <= TOP_ANCHOR_TOLERANCE_PX
        ) {
            return
        }

        await page.waitForTimeout(100)
    }

    throw new Error('Timed out waiting for the manual top resting ceiling to settle')
}

async function waitForTopAnchor(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
        ({ headerSelector, jumpTargetRowSelector, tolerancePx, viewportSelector }) => {
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

            function getFirstVisibleJumpTargetRow(viewport: HTMLDivElement): HTMLElement | null {
                const rows = [...viewport.querySelectorAll<HTMLElement>(jumpTargetRowSelector)]
                const viewportRect = viewport.getBoundingClientRect()
                const viewportTop = viewportRect.top + 1
                const viewportBottom = viewportRect.bottom
                return (
                    rows.find((row) => {
                        const rect = row.getBoundingClientRect()
                        return rect.bottom > viewportTop && rect.top < viewportBottom
                    }) ?? null
                )
            }

            const viewport = document.querySelector(viewportSelector)
            const headerStage = document.querySelector(headerSelector)
            const layout = viewport?.closest('.session-chat-page')
            if (!(viewport instanceof HTMLDivElement) || !(headerStage instanceof HTMLElement)) {
                return false
            }

            const topJumpTargetRow = getFirstVisibleJumpTargetRow(viewport)
            if (!(topJumpTargetRow instanceof HTMLElement)) {
                return false
            }

            const topDelta = topJumpTargetRow.getBoundingClientRect().top - headerStage.getBoundingClientRect().bottom
            const topAnchorGap = readLengthPx(
                layout instanceof HTMLElement ? layout : document.body,
                getComputedStyle(layout ?? document.documentElement).getPropertyValue('--chat-header-visual-clearance')
            )

            return Math.abs(topDelta - topAnchorGap) <= tolerancePx
        },
        {
            headerSelector: SESSION_CHAT_HEADER_STAGE_SELECTOR,
            jumpTargetRowSelector: TRANSCRIPT_JUMP_TARGET_ROW_SELECTOR,
            tolerancePx: TOP_ANCHOR_TOLERANCE_PX,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        },
        { timeout: timeoutMs }
    )
}

async function waitForTopAnchorIdle(page: Page, timeoutMs: number): Promise<void> {
    const startedAt = Date.now()
    let previousMeasurement: ChatTopAnchorMeasurement | null = null
    let stablePollCount = 0

    while (Date.now() - startedAt < timeoutMs) {
        const measurement = await readChatTopAnchorMeasurement(page)
        if (
            previousMeasurement &&
            measurement.scrollTop === previousMeasurement.scrollTop &&
            measurement.topJumpTargetRowTop === previousMeasurement.topJumpTargetRowTop &&
            measurement.topRowTop === previousMeasurement.topRowTop
        ) {
            stablePollCount += 1
        } else {
            stablePollCount = 0
        }

        if (stablePollCount >= 2) {
            return
        }

        previousMeasurement = measurement
        await page.waitForTimeout(100)
    }

    throw new Error('Timed out waiting for the top-anchor transaction to settle')
}

async function waitForTopOverlayScroll(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForFunction(
        ({ headerSelector, rowSelector, viewportSelector }) => {
            function getFirstVisibleRow(viewport: HTMLDivElement): HTMLElement | null {
                const rows = [...viewport.querySelectorAll<HTMLElement>(rowSelector)]
                const viewportRect = viewport.getBoundingClientRect()
                const viewportTop = viewportRect.top + 1
                const viewportBottom = viewportRect.bottom
                return (
                    rows.find((row) => {
                        const rect = row.getBoundingClientRect()
                        return rect.bottom > viewportTop && rect.top < viewportBottom
                    }) ??
                    rows[0] ??
                    null
                )
            }

            const viewport = document.querySelector(viewportSelector)
            const headerStage = document.querySelector(headerSelector)
            if (!(viewport instanceof HTMLDivElement) || !(headerStage instanceof HTMLElement)) {
                return false
            }

            const topRow = getFirstVisibleRow(viewport)
            if (!(topRow instanceof HTMLElement)) {
                return false
            }

            return topRow.getBoundingClientRect().top < headerStage.getBoundingClientRect().bottom
        },
        {
            headerSelector: SESSION_CHAT_HEADER_STAGE_SELECTOR,
            rowSelector: TRANSCRIPT_ROW_SELECTOR,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        },
        { timeout: timeoutMs }
    )
}

async function readChatTopAnchorMeasurement(page: Page): Promise<ChatTopAnchorMeasurement> {
    return await page.evaluate(
        ({ bottomControlSelector, headerSelector, jumpTargetRowSelector, rowSelector, viewportSelector }) => {
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

            function getFirstVisibleRow(viewport: HTMLDivElement): HTMLElement | null {
                const rows = [...viewport.querySelectorAll<HTMLElement>(rowSelector)]
                const viewportRect = viewport.getBoundingClientRect()
                const viewportTop = viewportRect.top + 1
                const viewportBottom = viewportRect.bottom
                return (
                    rows.find((row) => {
                        const rect = row.getBoundingClientRect()
                        return rect.bottom > viewportTop && rect.top < viewportBottom
                    }) ??
                    rows[0] ??
                    null
                )
            }

            function getFirstVisibleJumpTargetRow(viewport: HTMLDivElement): HTMLElement | null {
                const rows = [...viewport.querySelectorAll<HTMLElement>(jumpTargetRowSelector)]
                const viewportRect = viewport.getBoundingClientRect()
                const viewportTop = viewportRect.top + 1
                const viewportBottom = viewportRect.bottom
                return (
                    rows.find((row) => {
                        const rect = row.getBoundingClientRect()
                        return rect.bottom > viewportTop && rect.top < viewportBottom
                    }) ?? null
                )
            }

            const viewport = document.querySelector(viewportSelector)
            const headerStage = document.querySelector(headerSelector)
            const bottomButton = document.querySelector(bottomControlSelector)
            const layout = viewport?.closest('.session-chat-page')
            if (!(viewport instanceof HTMLDivElement) || !(headerStage instanceof HTMLElement)) {
                throw new Error('Chat top anchor measurement surface missing')
            }

            const topRow = getFirstVisibleRow(viewport)
            const topJumpTargetRow = getFirstVisibleJumpTargetRow(viewport)
            if (!(topRow instanceof HTMLElement)) {
                throw new Error('Visible transcript row missing for top anchor measurement')
            }

            return {
                bottomButtonVisible:
                    bottomButton instanceof HTMLButtonElement &&
                    !bottomButton.disabled &&
                    bottomButton.getAttribute('aria-hidden') !== 'true',
                headerBottom: Math.round(headerStage.getBoundingClientRect().bottom),
                scrollTop: Math.round(viewport.scrollTop),
                topAnchorGap: readLengthPx(
                    layout instanceof HTMLElement ? layout : document.body,
                    getComputedStyle(layout ?? document.documentElement).getPropertyValue(
                        '--chat-header-visual-clearance'
                    )
                ),
                topRowTop: Math.round(topRow.getBoundingClientRect().top),
                topJumpTargetRowTop:
                    topJumpTargetRow instanceof HTMLElement
                        ? Math.round(topJumpTargetRow.getBoundingClientRect().top)
                        : null,
            }
        },
        {
            bottomControlSelector: THREAD_BOTTOM_CONTROL_SELECTOR,
            headerSelector: SESSION_CHAT_HEADER_STAGE_SELECTOR,
            jumpTargetRowSelector: TRANSCRIPT_JUMP_TARGET_ROW_SELECTOR,
            rowSelector: TRANSCRIPT_ROW_SELECTOR,
            viewportSelector: SESSION_CHAT_VIEWPORT_SELECTOR,
        }
    )
}
