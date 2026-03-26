const NON_CRITICAL_FEATURE_CHUNK_NAMES = [
    'SessionsShell',
    'chat',
    'SessionChatWorkspace',
    'sessionDetailPreload',
    'sessionDetailRoutePreload',
    'terminal',
    'files',
    'DirectoryTree',
    'file',
    'fileContentView',
    'new',
    'settings',
    'vendor-terminal',
    'vendor-syntax',
    'vendor-assistant-runtime',
    'vendor-assistant-primitives',
    'markdown-text',
    'MarkdownPrimitive',
    'markdownConfig',
    'ShikiCodeContent',
    'AppFloatingNoticeLayer',
    'FloatingActionMenu',
    'FloatingActionMenu.contract',
    'InstallPrompt',
    'LoginPrompt',
    'registerRuntimeServiceWorker',
    'workbox-window.prod.es5',
    'usePWAInstall',
    'SessionAutocompleteSkills',
    'SessionAutocompleteSlashCommands',
    'recent-skills',
    'sessionAutocompleteQuery',
    'SessionHeaderActionMenu',
    'SessionListActionController',
    'TeamPanel',
    'VibyThread',
    'VibyComposer',
    'ComposerDraftController',
    'ComposerControlsOverlay',
    'useActiveSuggestions',
    'RichAssistantTextMessageContent',
    'RichAssistantToolMessageContent',
    'CliOutputBlock',
    'reasoning',
    'clientAutocomplete',
    'clientMachines',
    'clientPush',
    'clientWorkspace',
    'featureIcons',
    'message-window-store',
    'messageWindowStoreCore',
    'messageWindowStoreAsync',
    'modes',
    'reducerCliOutput',
    'sessionQueryCache',
    'dialog',
    'usePushNotifications',
    'TerminalView',
    'filesPageViews',
    'MarkdownRenderer',
    '_all',
    '_results',
    'zh-CN',
] as const

const NON_CRITICAL_CODE_HIGHLIGHT_CHUNK_NAMES = [
    'github-light',
    'github-dark',
    'shellscript',
    'powershell',
    'json',
    'yaml',
    'toml',
    'xml',
    'ini',
    'markdown',
    'html',
    'css',
    'scss',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'sql',
    'graphql',
    'c',
    'rust',
    'go',
    'java',
    'kotlin',
    'python',
    'php',
    'swift',
    'csharp',
    'dockerfile',
    'make',
    'diff',
] as const

export const NON_CRITICAL_PRECACHE_CHUNK_NAMES = [
    ...NON_CRITICAL_FEATURE_CHUNK_NAMES,
    ...NON_CRITICAL_CODE_HIGHLIGHT_CHUNK_NAMES
] as const

const NON_CRITICAL_PRECACHE_MARKERS = NON_CRITICAL_PRECACHE_CHUNK_NAMES.map(
    (chunkName) => `assets/${chunkName}-`
)

export type PrecacheManifestEntry = string | { url: string; revision?: string }

function getPrecacheEntryUrl(entry: PrecacheManifestEntry): string {
    return typeof entry === 'string' ? entry : entry.url
}

export function isNonCriticalPrecacheAssetUrl(url: string): boolean {
    const normalizedUrl = url.startsWith('/') ? url.slice(1) : url
    return NON_CRITICAL_PRECACHE_MARKERS.some((marker) => normalizedUrl.includes(marker))
}

function shouldPrecacheEntry(entry: PrecacheManifestEntry): boolean {
    return !isNonCriticalPrecacheAssetUrl(getPrecacheEntryUrl(entry))
}

export function buildAppShellPrecacheManifest(
    manifest: ReadonlyArray<PrecacheManifestEntry>
): PrecacheManifestEntry[] {
    return manifest.filter(shouldPrecacheEntry)
}
