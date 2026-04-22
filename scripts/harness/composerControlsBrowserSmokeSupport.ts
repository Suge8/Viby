import type { Page } from 'playwright-core'
import {
    COMPOSER_COLLABORATION_SECTION_SELECTOR,
    COMPOSER_CONTROLS_BUTTON_SELECTOR,
    COMPOSER_CONTROLS_PANEL_SELECTOR,
    COMPOSER_MODEL_SECTION_SELECTOR,
    COMPOSER_PERMISSION_SECTION_SELECTOR,
    COMPOSER_REASONING_SECTION_SELECTOR,
    COMPOSER_SWITCH_AGENT_SECTION_SELECTOR,
    getComposerSwitchTargetSelector,
    SESSION_CHAT_PAGE_SELECTOR,
    SESSION_LIST_ITEM_SELECTOR,
    SESSIONS_LIST_PANE_SELECTOR,
} from '../../web/src/lib/sessionUiContracts'
import { buildSessionHref, SESSIONS_INDEX_ROUTE } from '../../web/src/routes/sessions/sessionRoutePaths'

export type PanelCapabilityCheck = {
    currentAgentVisible: boolean
    sections: {
        collaboration: boolean
        model: boolean
        permission: boolean
        reasoning: boolean
    }
    switchAgentVisible: boolean
    switchTargets: {
        codex: boolean
        cursor: boolean
        gemini: boolean
        opencode: boolean
        pi: boolean
    }
}

export async function waitForListReady(page: Page, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === SESSIONS_INDEX_ROUTE, { timeout: timeoutMs })
    await page.locator(SESSIONS_LIST_PANE_SELECTOR).first().waitFor({ timeout: timeoutMs })
    await page.locator(SESSION_LIST_ITEM_SELECTOR).first().waitFor({ timeout: timeoutMs })
}

export async function waitForChatReady(page: Page, sessionId: string, timeoutMs: number): Promise<void> {
    await page.waitForURL((url) => url.pathname === buildSessionHref(sessionId), { timeout: timeoutMs })
    await page.locator(SESSION_CHAT_PAGE_SELECTOR).first().waitFor({ timeout: timeoutMs })
    await page.locator(COMPOSER_CONTROLS_BUTTON_SELECTOR).waitFor({ timeout: timeoutMs })
}

export async function waitForComposerControlsReady(page: Page, timeoutMs: number): Promise<void> {
    await page.locator(COMPOSER_CONTROLS_PANEL_SELECTOR).first().waitFor({ timeout: timeoutMs })
    await page.locator(COMPOSER_SWITCH_AGENT_SECTION_SELECTOR).first().waitFor({ timeout: timeoutMs })
}

export async function openSwitchAgentTargets(
    page: Page,
    timeoutMs: number,
    targetDriver: 'codex' | 'gemini' | 'opencode' | 'cursor' | 'pi'
): Promise<void> {
    await page.locator(COMPOSER_SWITCH_AGENT_SECTION_SELECTOR).locator('button').first().click()
    await page.locator(getComposerSwitchTargetSelector(targetDriver)).waitFor({ timeout: timeoutMs })
}

async function hasVisibleLocator(page: Page, selector: string): Promise<boolean> {
    return (await page.locator(selector).count()) > 0
}

export async function readPanelCapabilityCheck(page: Page): Promise<PanelCapabilityCheck> {
    const switchAgentSection = page.locator(COMPOSER_SWITCH_AGENT_SECTION_SELECTOR).first()
    const currentDriver = await switchAgentSection.getAttribute('data-current-driver')

    return {
        switchAgentVisible: (await switchAgentSection.count()) > 0,
        currentAgentVisible: currentDriver === 'claude',
        sections: {
            model: await hasVisibleLocator(page, COMPOSER_MODEL_SECTION_SELECTOR),
            reasoning: await hasVisibleLocator(page, COMPOSER_REASONING_SECTION_SELECTOR),
            collaboration: await hasVisibleLocator(page, COMPOSER_COLLABORATION_SECTION_SELECTOR),
            permission: await hasVisibleLocator(page, COMPOSER_PERMISSION_SECTION_SELECTOR),
        },
        switchTargets: {
            codex: await hasVisibleLocator(page, getComposerSwitchTargetSelector('codex')),
            gemini: await hasVisibleLocator(page, getComposerSwitchTargetSelector('gemini')),
            opencode: await hasVisibleLocator(page, getComposerSwitchTargetSelector('opencode')),
            cursor: await hasVisibleLocator(page, getComposerSwitchTargetSelector('cursor')),
            pi: await hasVisibleLocator(page, getComposerSwitchTargetSelector('pi')),
        },
    }
}

export function isExpectedClaudePanel(check: PanelCapabilityCheck): boolean {
    return (
        check.switchAgentVisible &&
        check.currentAgentVisible &&
        check.sections.model &&
        check.sections.reasoning &&
        check.sections.permission &&
        !check.sections.collaboration &&
        check.switchTargets.codex &&
        check.switchTargets.gemini &&
        check.switchTargets.opencode &&
        check.switchTargets.cursor &&
        check.switchTargets.pi
    )
}
