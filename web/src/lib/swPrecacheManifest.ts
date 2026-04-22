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
    'recent-skills',
    'sessionAutocompleteQuery',
    'SessionHeaderActionMenu',
    'SessionListActionController',
    'ProjectPanel',
    'MemberControlBanner',
    'VibyComposer',
    'ComposerControlsOverlay',
    'useActiveSuggestions',
    'CliOutputBlock',
    'clientAutocomplete',
    'clientRuntime',
    'clientPush',
    'clientWorkspace',
    'featureIcons',
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
    'markdown',
    'html',
    'css',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'sql',
    'graphql',
    'rust',
    'go',
    'python',
    'diff',
] as const

const OPTIONAL_RUNTIME_CACHE_CHUNK_NAMES = [
    'vendor-terminal',
    'MarkdownRenderer',
    'markdownConfig',
    'ShikiCodeContent',
    'github-light',
    'github-dark',
    'shellscript',
    'powershell',
    'json',
    'yaml',
    'toml',
    'markdown',
    'html',
    'css',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'sql',
    'graphql',
    'rust',
    'go',
    'python',
    'diff',
] as const

export const NON_CRITICAL_PRECACHE_CHUNK_NAMES = [
    ...NON_CRITICAL_FEATURE_CHUNK_NAMES,
    ...NON_CRITICAL_CODE_HIGHLIGHT_CHUNK_NAMES,
] as const

const NON_CRITICAL_PRECACHE_MARKERS = NON_CRITICAL_PRECACHE_CHUNK_NAMES.map((chunkName) => `assets/${chunkName}-`)
const OPTIONAL_RUNTIME_CACHE_MARKERS = OPTIONAL_RUNTIME_CACHE_CHUNK_NAMES.map((chunkName) => `assets/${chunkName}-`)

export type PrecacheManifestEntry = string | { url: string; revision?: string }

function getPrecacheEntryUrl(entry: PrecacheManifestEntry): string {
    return typeof entry === 'string' ? entry : entry.url
}

export function isNonCriticalPrecacheAssetUrl(url: string): boolean {
    const normalizedUrl = url.startsWith('/') ? url.slice(1) : url
    return NON_CRITICAL_PRECACHE_MARKERS.some((marker) => normalizedUrl.includes(marker))
}

export function isOptionalRuntimeCacheAssetUrl(url: string): boolean {
    const normalizedUrl = url.startsWith('/') ? url.slice(1) : url
    return OPTIONAL_RUNTIME_CACHE_MARKERS.some((marker) => normalizedUrl.includes(marker))
}

function shouldPrecacheEntry(entry: PrecacheManifestEntry): boolean {
    return !isNonCriticalPrecacheAssetUrl(getPrecacheEntryUrl(entry))
}

export function buildAppShellPrecacheManifest(manifest: ReadonlyArray<PrecacheManifestEntry>): PrecacheManifestEntry[] {
    return manifest.filter(shouldPrecacheEntry)
}
