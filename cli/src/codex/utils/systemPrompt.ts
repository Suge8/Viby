/**
 * Codex-specific system prompt.
 *
 * Codex no longer injects a Viby-specific title tool instruction.
 * Session naming now falls back to existing metadata/path display and
 * optional manual rename from the UI, which removes non-essential
 * first-turn work from the critical path.
 */
export const codexSystemPrompt = '';
