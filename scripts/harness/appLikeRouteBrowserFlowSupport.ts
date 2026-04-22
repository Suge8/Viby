import type { Page } from 'playwright-core'
import {
    SESSION_CHAT_BACK_BUTTON_SELECTOR,
    SESSION_CHAT_PAGE_SELECTOR,
    SESSION_LIST_CREATE_BUTTON_SELECTOR,
    SESSION_LIST_ITEM_SELECTOR,
    SESSION_ROUTE_BACK_BUTTON_SELECTOR,
    SESSIONS_SHELL_SETTINGS_BUTTON_SELECTOR,
    TERMINAL_SURFACE_INTERACTIVE_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'
import {
    buildSessionFilePath,
    buildSessionFilesPath,
    buildSessionHref,
    buildSessionTerminalPath,
    NEW_SESSION_ROUTE,
    SESSIONS_INDEX_ROUTE,
    SETTINGS_ROUTE,
} from '../../web/src/routes/sessions/sessionRoutePaths'
import { assertChatBottomAnchorBehavior } from './appLikeChatBottomAnchorSupport'
import { assertChatTopAnchorBehavior } from './appLikeChatTopAnchorSupport'
import { captureFlow, type FlowArtifact } from './appLikeRouteBrowserProbeSupport'

const CLOSE_BUTTON_SELECTOR = 'button[aria-label="Close"], button[aria-label="关闭"]'
export const LOGIN_INPUT_SELECTOR = 'input[name="accessToken"]'
const LOGIN_SUBMIT_SELECTOR = 'button[type="submit"]'

export async function runAppLikeRouteFlows(options: {
    cliApiToken: string
    outputDir: string
    page: Page
    probeDurationMs: number
    routeSettleTimeoutMs: number
    sessionFilePath: string
    sessionId: string
    sessionLabel: string
}): Promise<FlowArtifact[]> {
    const sessionLabelPattern = new RegExp(`${options.sessionLabel}|${options.sessionId.slice(0, 8)}`)
    const flowArtifacts: FlowArtifact[] = []

    flowArtifacts.push(
        await captureFlow({
            id: 'login-to-list',
            outputDir: options.outputDir,
            page: options.page,
            probeDurationMs: options.probeDurationMs,
            allowLoginVisible: true,
            action: async () => {
                await options.page.locator(LOGIN_INPUT_SELECTOR).fill(options.cliApiToken)
                await options.page.locator(LOGIN_SUBMIT_SELECTOR).click()
            },
            ready: async () => {
                await waitForListReady({
                    page: options.page,
                    sessionLabel: sessionLabelPattern,
                    timeoutMs: options.routeSettleTimeoutMs,
                })
            },
        })
    )
    await options.page.screenshot({ path: `${options.outputDir}/list-ready.png` })

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'list-to-chat',
            action: async () => {
                await options.page
                    .locator(SESSION_LIST_ITEM_SELECTOR)
                    .filter({ hasText: sessionLabelPattern })
                    .first()
                    .click()
            },
            ready: () => waitForChatReady(options.page, options.sessionId, options.routeSettleTimeoutMs),
        })
    )
    await assertChatTopAnchorBehavior({
        outputDir: options.outputDir,
        page: options.page,
        settleTimeoutMs: options.routeSettleTimeoutMs,
    })
    await assertChatBottomAnchorBehavior({
        outputDir: options.outputDir,
        page: options.page,
        settleTimeoutMs: options.routeSettleTimeoutMs,
    })

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'chat-to-files',
            action: async () => {
                await options.page.getByTitle(/More actions|更多操作/).click()
                await options.page.locator('.ds-floating-action-menu [role="menuitem"]').first().click()
            },
            ready: () =>
                waitForFilesReady(
                    options.page,
                    options.sessionId,
                    options.sessionFilePath,
                    options.routeSettleTimeoutMs
                ),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'files-to-file',
            action: async () => {
                await options.page.getByText(options.sessionFilePath, { exact: true }).first().click()
            },
            ready: () => waitForFileReady(options.page, options.sessionId, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'file-to-files',
            action: async () => {
                await options.page.locator(SESSION_ROUTE_BACK_BUTTON_SELECTOR).first().click()
            },
            ready: () =>
                waitForFilesReady(
                    options.page,
                    options.sessionId,
                    options.sessionFilePath,
                    options.routeSettleTimeoutMs
                ),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'files-to-chat',
            action: async () => {
                await options.page.locator(SESSION_ROUTE_BACK_BUTTON_SELECTOR).first().click()
            },
            ready: () => waitForChatReady(options.page, options.sessionId, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'chat-to-terminal',
            action: async () => {
                await options.page.getByTitle(/More actions|更多操作/).click()
                await options.page.locator('.ds-floating-action-menu [role="menuitem"]').last().click()
            },
            ready: () => waitForTerminalReady(options.page, options.sessionId, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'terminal-to-chat',
            action: async () => {
                await options.page.locator(SESSION_ROUTE_BACK_BUTTON_SELECTOR).first().click()
            },
            ready: () => waitForChatReady(options.page, options.sessionId, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'chat-to-list',
            action: async () => {
                await options.page.locator(SESSION_CHAT_BACK_BUTTON_SELECTOR).first().click()
            },
            ready: async () => {
                await waitForListReady({
                    page: options.page,
                    sessionLabel: sessionLabelPattern,
                    timeoutMs: options.routeSettleTimeoutMs,
                })
            },
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'list-to-new',
            action: async () => {
                await options.page.locator(SESSION_LIST_CREATE_BUTTON_SELECTOR).first().click()
            },
            ready: () => waitForNewSessionReady(options.page, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'new-to-list',
            action: async () => {
                await options.page.locator(CLOSE_BUTTON_SELECTOR).first().click()
            },
            ready: async () => {
                await waitForListReady({
                    page: options.page,
                    sessionLabel: sessionLabelPattern,
                    timeoutMs: options.routeSettleTimeoutMs,
                })
            },
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'list-to-settings',
            action: async () => {
                await options.page.locator(SESSIONS_SHELL_SETTINGS_BUTTON_SELECTOR).first().click()
            },
            ready: () => waitForSettingsReady(options.page, options.routeSettleTimeoutMs),
        })
    )

    flowArtifacts.push(
        await captureSessionFlow(options, {
            id: 'settings-to-list',
            action: async () => {
                await options.page.locator(CLOSE_BUTTON_SELECTOR).first().click()
            },
            ready: async () => {
                await waitForListReady({
                    page: options.page,
                    sessionLabel: sessionLabelPattern,
                    timeoutMs: options.routeSettleTimeoutMs,
                })
            },
        })
    )

    return flowArtifacts
}

async function captureSessionFlow(
    options: {
        outputDir: string
        page: Page
        probeDurationMs: number
    },
    flow: {
        action: () => Promise<void>
        id: string
        ready: () => Promise<void>
    }
): Promise<FlowArtifact> {
    return await captureFlow({
        id: flow.id,
        outputDir: options.outputDir,
        page: options.page,
        probeDurationMs: options.probeDurationMs,
        action: flow.action,
        ready: flow.ready,
    })
}

async function waitForListReady(options: {
    page: Page
    sessionLabel: string | RegExp
    timeoutMs: number
}): Promise<void> {
    await options.page.waitForURL((url) => url.pathname === SESSIONS_INDEX_ROUTE, { timeout: options.timeoutMs })
    await options.page.locator('[data-testid="sessions-list-pane"]').first().waitFor({ timeout: options.timeoutMs })
    await options.page.locator(SESSION_LIST_ITEM_SELECTOR).filter({ hasText: options.sessionLabel }).first().waitFor({
        timeout: options.timeoutMs,
    })
}

async function waitForChatReady(page: Page, sessionId: string, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === buildSessionHref(sessionId), { timeout: timeoutMs })
    await page.locator(SESSION_CHAT_PAGE_SELECTOR).first().waitFor({ timeout: timeoutMs })
}

async function waitForFilesReady(
    page: Page,
    sessionId: string,
    sessionFilePath: string,
    timeoutMs: number
): Promise<void> {
    await page.waitForURL((url) => url.pathname === buildSessionFilesPath(sessionId), { timeout: timeoutMs })
    await page.getByText(sessionFilePath, { exact: true }).first().waitFor({ timeout: timeoutMs })
}

async function waitForFileReady(page: Page, sessionId: string, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === buildSessionFilePath(sessionId), { timeout: timeoutMs })
    await page.locator(SESSION_ROUTE_BACK_BUTTON_SELECTOR).first().waitFor({ timeout: timeoutMs })
}

async function waitForTerminalReady(page: Page, sessionId: string, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === buildSessionTerminalPath(sessionId), { timeout: timeoutMs })
    await page.locator('.xterm').first().waitFor({ timeout: timeoutMs })
    await page.locator(TERMINAL_SURFACE_INTERACTIVE_SELECTOR).first().waitFor({ timeout: timeoutMs })
}

async function waitForNewSessionReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === NEW_SESSION_ROUTE, { timeout: timeoutMs })
    await page
        .locator('h1')
        .filter({ hasText: /Create Session|创建会话/ })
        .waitFor({ timeout: timeoutMs })
}

async function waitForSettingsReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === SETTINGS_ROUTE, { timeout: timeoutMs })
    await page
        .locator('h1')
        .filter({ hasText: /Settings|设置/ })
        .waitFor({ timeout: timeoutMs })
}
