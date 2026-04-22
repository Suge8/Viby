function getTestIdSelector(testId: string): string {
    return `[data-testid="${testId}"]`
}

export const SESSION_CHAT_BACK_BUTTON_TEST_ID = 'session-chat-back-button'
export const SESSION_CHAT_BACK_BUTTON_SELECTOR = getTestIdSelector(SESSION_CHAT_BACK_BUTTON_TEST_ID)

export const SESSION_LIST_CREATE_BUTTON_TEST_ID = 'session-list-create-button'
export const SESSION_LIST_CREATE_BUTTON_SELECTOR = getTestIdSelector(SESSION_LIST_CREATE_BUTTON_TEST_ID)

export const SESSIONS_LIST_PANE_TEST_ID = 'sessions-list-pane'
export const SESSIONS_LIST_PANE_SELECTOR = getTestIdSelector(SESSIONS_LIST_PANE_TEST_ID)
export const SESSIONS_LIST_SCROLLER_TEST_ID = 'sessions-list-scroller'
export const SESSIONS_LIST_SCROLLER_SELECTOR = getTestIdSelector(SESSIONS_LIST_SCROLLER_TEST_ID)

export const SESSION_LIST_ITEM_TEST_ID = 'session-list-item'
export const SESSION_LIST_ITEM_SELECTOR = getTestIdSelector(SESSION_LIST_ITEM_TEST_ID)

export const SESSION_ROUTE_BACK_BUTTON_TEST_ID = 'session-route-back-button'
export const SESSION_ROUTE_BACK_BUTTON_SELECTOR = getTestIdSelector(SESSION_ROUTE_BACK_BUTTON_TEST_ID)

export const SESSION_ROUTE_PAGE_SURFACE_TEST_ID = 'session-route-page-surface'
export const SESSION_ROUTE_PAGE_SURFACE_SELECTOR = getTestIdSelector(SESSION_ROUTE_PAGE_SURFACE_TEST_ID)

export const SESSIONS_SHELL_SETTINGS_BUTTON_TEST_ID = 'sessions-shell-settings-button'
export const SESSIONS_SHELL_SETTINGS_BUTTON_SELECTOR = getTestIdSelector(SESSIONS_SHELL_SETTINGS_BUTTON_TEST_ID)

export const SESSION_CHAT_PAGE_TEST_ID = 'session-chat-page'
export const SESSION_CHAT_PAGE_SELECTOR = getTestIdSelector(SESSION_CHAT_PAGE_TEST_ID)
export const SESSION_CHAT_HEADER_STAGE_TEST_ID = 'session-chat-header-stage'
export const SESSION_CHAT_HEADER_STAGE_SELECTOR = getTestIdSelector(SESSION_CHAT_HEADER_STAGE_TEST_ID)
export const SESSION_CHAT_VIEWPORT_TEST_ID = 'session-chat-viewport'
export const SESSION_CHAT_VIEWPORT_SELECTOR = getTestIdSelector(SESSION_CHAT_VIEWPORT_TEST_ID)
export const SESSION_CHAT_COMPOSER_STAGE_TEST_ID = 'session-chat-composer-stage'
export const SESSION_CHAT_COMPOSER_STAGE_SELECTOR = getTestIdSelector(SESSION_CHAT_COMPOSER_STAGE_TEST_ID)
export const SESSION_CHAT_COMPOSER_SURFACE_TEST_ID = 'session-chat-composer-surface'
export const SESSION_CHAT_COMPOSER_SURFACE_SELECTOR = getTestIdSelector(SESSION_CHAT_COMPOSER_SURFACE_TEST_ID)
export const TRANSCRIPT_ROW_TEST_ID = 'transcript-row'
export const TRANSCRIPT_ROW_SELECTOR = getTestIdSelector(TRANSCRIPT_ROW_TEST_ID)
export const TRANSCRIPT_JUMP_TARGET_ROW_SELECTOR = `${TRANSCRIPT_ROW_SELECTOR}[data-history-jump-target="true"]`

export const COMPOSER_CONTROLS_BUTTON_TEST_ID = 'composer-controls-button'
export const COMPOSER_CONTROLS_BUTTON_SELECTOR = getTestIdSelector(COMPOSER_CONTROLS_BUTTON_TEST_ID)
export const COMPOSER_INPUT_TEST_ID = 'composer-input'
export const COMPOSER_INPUT_SELECTOR = getTestIdSelector(COMPOSER_INPUT_TEST_ID)
export const COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID = 'composer-primary-action-button'
export const COMPOSER_PRIMARY_ACTION_BUTTON_SELECTOR = getTestIdSelector(COMPOSER_PRIMARY_ACTION_BUTTON_TEST_ID)

export const COMPOSER_CONTROLS_PANEL_TEST_ID = 'composer-controls-panel'
export const COMPOSER_CONTROLS_PANEL_SELECTOR = getTestIdSelector(COMPOSER_CONTROLS_PANEL_TEST_ID)

export const COMPOSER_SWITCH_AGENT_SECTION_TEST_ID = 'composer-switch-agent-section'
export const COMPOSER_SWITCH_AGENT_SECTION_SELECTOR = getTestIdSelector(COMPOSER_SWITCH_AGENT_SECTION_TEST_ID)
export const COMPOSER_MODEL_SECTION_TEST_ID = 'composer-model-section'
export const COMPOSER_MODEL_SECTION_SELECTOR = getTestIdSelector(COMPOSER_MODEL_SECTION_TEST_ID)
export const COMPOSER_REASONING_SECTION_TEST_ID = 'composer-reasoning-section'
export const COMPOSER_REASONING_SECTION_SELECTOR = getTestIdSelector(COMPOSER_REASONING_SECTION_TEST_ID)
export const COMPOSER_COLLABORATION_SECTION_TEST_ID = 'composer-collaboration-section'
export const COMPOSER_COLLABORATION_SECTION_SELECTOR = getTestIdSelector(COMPOSER_COLLABORATION_SECTION_TEST_ID)
export const COMPOSER_PERMISSION_SECTION_TEST_ID = 'composer-permission-section'
export const COMPOSER_PERMISSION_SECTION_SELECTOR = getTestIdSelector(COMPOSER_PERMISSION_SECTION_TEST_ID)

export function getComposerSwitchTargetTestId(driver: string): string {
    return `composer-switch-target-${driver}`
}

export function getComposerSwitchTargetSelector(driver: string): string {
    return getTestIdSelector(getComposerSwitchTargetTestId(driver))
}

export const TERMINAL_SURFACE_INTERACTIVE_TEST_ID = 'terminal-surface-interactive'
export const TERMINAL_SURFACE_INTERACTIVE_SELECTOR = getTestIdSelector(TERMINAL_SURFACE_INTERACTIVE_TEST_ID)

export const THREAD_BOTTOM_CONTROL_TEST_ID = 'thread-bottom-control'
export const THREAD_BOTTOM_CONTROL_SELECTOR = getTestIdSelector(THREAD_BOTTOM_CONTROL_TEST_ID)
export const THREAD_HISTORY_CONTROL_TEST_ID = 'thread-history-control'
export const THREAD_HISTORY_CONTROL_SELECTOR = getTestIdSelector(THREAD_HISTORY_CONTROL_TEST_ID)
