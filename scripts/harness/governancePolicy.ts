export const harnessBunVersion = '1.3.11'
export const rootPackageManager = `bun@${harnessBunVersion}`
export const rootBunEngineRange = `>=${harnessBunVersion} <2`

export const dependencyVersionPolicy = {
    '@biomejs/biome': '2.4.10',
    react: '^19.2.3',
    'react-dom': '^19.2.3',
    typescript: '^5.9.3',
    'bun-types': '^1.3.11',
    vite: '^7.3.0',
    vitest: '^4.0.16',
    zod: '^4.2.1',
} as const

export const requiredRootTypecheckScripts = [
    'typecheck:cli',
    'typecheck:web',
    'typecheck:hub',
    'typecheck:desktop',
    'typecheck:pairing',
    'typecheck:shared',
] as const

export const requiredRootTestScripts = ['test:cli', 'test:hub', 'test:web', 'test:pairing', 'test:shared'] as const

export const rawButtonOwnerFiles = new Set([
    'web/src/components/ui/button.tsx',
    'web/src/components/ui/plain-button.tsx',
])

export const rawInputOwnerFiles = new Set([
    'web/src/components/ui/input.tsx',
    'web/src/components/ui/checkbox.tsx',
    'web/src/components/ui/switch.tsx',
    'web/src/components/ui/file-input.tsx',
])

export const rawTextareaOwnerFiles = new Set(['web/src/components/ui/textarea.tsx'])

export const rawSelectOwnerFiles = new Set(['web/src/components/ui/select.tsx'])

export const consoleOwnerPrefixes = [
    'scripts/',
    'cli/scripts/',
    'desktop/scripts/',
    'hub/scripts/',
    'web/scripts/',
    'cli/src/commands/',
    'cli/src/ui/',
    'hub/src/runtime/',
    'web/src/boot/',
    'pairing/src/index.ts',
] as const

export const consoleOwnerFiles = new Set([
    'cli/src/index.ts',
    'cli/src/runner/run.ts',
    'cli/src/runner/doctor.ts',
    'cli/src/runner/runnerIntegrationTestHarness.ts',
    'cli/src/ui/logger.ts',
    'hub/src/configuration.ts',
    'hub/src/devHot.ts',
    'hub/src/web/server.ts',
    'pairing/src/http.ts',
    'web/src/lib/installVitePreloadErrorHandler.ts',
    'web/src/lib/runtimeDiagnostics.ts',
])

export const fireAndForgetOwnerFiles = new Set([
    'cli/src/agent/runnerLifecycle.ts',
    'cli/src/runner/controlServer.ts',
    'cli/src/runner/runnerTrackedSessionControl.ts',
    'cli/src/utils/spawnWithAbort.ts',
    'hub/src/devHot.ts',
    'hub/src/runtime/managedRunner.ts',
    'web/src/routes/sessions/chat.tsx',
    'web/src/routes/sessions/files.tsx',
    'web/src/routes/sessions/new.tsx',
    'web/src/routes/sessions/sessionDetailRoutePreload.ts',
    'web/src/routes/settings/index.tsx',
    'web/src/components/AppController.tsx',
    'web/src/components/AppRealtimeRuntime.tsx',
    'web/src/components/MemberControlBanner.tsx',
    'web/src/components/SessionChat.tsx',
    'web/src/components/TeamHistoryDrawer.tsx',
    'web/src/components/TeamRoleManagerDialog.tsx',
    'web/src/components/useSessionChatLocalNotices.ts',
    'web/src/hooks/useAppGoBack.ts',
    'web/src/hooks/useAuth.ts',
    'web/src/hooks/usePushNotifications.ts',
    'web/src/hooks/queries/useMessages.ts',
    'web/src/hooks/queries/sessionViewRuntime.ts',
    'web/src/lib/i18n-context.tsx',
    'web/src/lib/sessionQueryCache.ts',
])

export const fireAndForgetOwnerPrefixes = [
    'web/src/components/AssistantChat/',
    'web/src/routes/sessions/',
    'desktop/src/',
] as const

export const zodOwnerPrefixes = [
    'shared/src/',
    'pairing/src/',
    'hub/src/web/middleware/',
    'hub/src/web/routes/',
    'hub/src/socket/handlers/',
    'hub/src/config/',
    'cli/src/api/',
] as const

export const zodOwnerFiles = new Set([
    'hub/src/socket/server.ts',
    'hub/src/sync/machineCache.ts',
    'cli/src/agent/vibyToolSchemas.ts',
    'cli/src/claude/types.ts',
    'cli/src/pi/vibyTeamIntegration.ts',
    'cli/src/runner/controlServer.ts',
])

export const sqlOwnerPrefixes = ['hub/src/store/', 'hub/scripts/'] as const

export const explicitControlSurfaceOwnerFiles = new Set([
    'cli/scripts/sessionCapabilityBridgeSmoke.ts',
    'cli/src/agent/backends/acp/acpSessionUpdateTracker.ts',
    'cli/src/agent/readyEventScheduler.ts',
    'cli/src/api/apiSessionTransport.ts',
    'cli/src/claude/sdk/QueryRuntime.ts',
    'cli/src/copilot/copilotRemoteLauncher.ts',
    'cli/src/codex/codexAppServerBridge.ts',
    'cli/src/codex/codexRemoteCoordinator.ts',
    'cli/src/codex/codexRemoteTurnLifecycle.ts',
    'cli/src/modules/common/commandCapabilityCache.ts',
    'hub/src/notifications/notificationHub.ts',
    'hub/src/sync/eventPublisher.ts',
    'desktop/src/hooks/usePairingBridge.ts',
    'desktop/src/lib/pairingBridgeController.ts',
    'desktop/src/lib/pairingBridgeControllerSupport.ts',
    'desktop/src/lib/pairingBridgeStatsSupport.ts',
    'desktop/src/lib/pairingBridgeTelemetrySupport.ts',
    'desktop/src/lib/pairingBridgeTransportSupport.ts',
    'pairing/src/landingPage.ts',
    'pairing/src/landingPageScriptClientSupport.ts',
    'pairing/src/landingPageScriptDeviceSupport.ts',
    'pairing/src/landingPageScriptTransport.ts',
    'pairing/src/landingPageScriptUi.ts',
    'web/src/api/client.ts',
    'web/src/boot/registerRuntimeServiceWorker.ts',
    'web/src/components/AppController.tsx',
    'web/src/components/AppRealtimeRuntime.tsx',
    'web/src/components/AssistantChat/useChatViewportLayout.ts',
    'web/src/components/AssistantChat/useComposerInputController.ts',
    'web/src/components/AssistantChat/useComposerDraftPersistence.ts',
    'web/src/components/AssistantChat/useTranscriptExplicitBottom.ts',
    'web/src/components/AssistantChat/useTranscriptLeaveBottomIntent.ts',
    'web/src/components/AssistantChat/transcriptVirtuosoEffects.ts',
    'web/src/components/AssistantChat/useTranscriptHistoryNavigation.ts',
    'web/src/components/AssistantChat/useTranscriptTopAnchor.ts',
    'web/src/components/AssistantChat/useTranscriptViewportControls.ts',
    'web/src/components/AssistantChat/useTranscriptVirtuoso.ts',
    'web/src/components/FloatingNoticeViewport.tsx',
    'web/src/components/LoginPrompt.tsx',
    'web/src/components/MemberControlBanner.tsx',
    'web/src/components/NewSession/useResumeExistingState.ts',
    'web/src/components/NewSession/useNewSessionDirectoryState.ts',
    'web/src/components/SessionChatRuntimeSurface.tsx',
    'web/src/components/ProjectTaskEditorDialog.tsx',
    'web/src/components/ProjectWorkflowDialog.tsx',
    'web/src/components/SessionChat.tsx',
    'web/src/components/SessionList.tsx',
    'web/src/components/TeamHistoryDrawer.tsx',
    'web/src/components/TeamRoleManagerDialog.tsx',
    'web/src/lib/browserLifecycle.ts',
    'web/src/components/session-list/SessionListActionController.tsx',
    'web/src/components/useProjectPanelModel.ts',
    'web/src/hooks/mutations/useTeamMemberControlActions.ts',
    'web/src/hooks/queries/useRuntimeDirectoryBrowser.ts',
    'web/src/hooks/useAppGoBack.ts',
    'web/src/hooks/useRuntimePathsExists.ts',
    'web/src/hooks/useRuntimeUpdateState.ts',
    'web/src/hooks/useViewportInteractionGuards.ts',
    'web/src/lib/appRecovery.ts',
    'web/src/lib/installVitePreloadErrorHandler.ts',
    'web/src/lib/navigationTransition.ts',
    'web/src/lib/sessionViewReconciler.ts',
    'web/src/lib/warmSnapshotLifecycle.ts',
    'web/src/lib/warmSnapshotWriteScheduler.ts',
    'web/src/routes/sessions/new.tsx',
    'web/src/routes/sessions/SessionAutocompleteCapabilities.ts',
    'web/src/routes/sessions/sessionChatRouteRuntime.ts',
    'web/src/routes/sessions/sessionsShellSupport.ts',
    'web/src/routes/sessions/useTerminalPageController.ts',
    'web/src/sw.ts',
])

type ControllerOwnerRule = {
    rule: string
    message: string
    patterns: readonly RegExp[]
    ownerFiles?: ReadonlySet<string>
    ownerPrefixes?: readonly string[]
}

export type ControllerOwnerViolation = {
    rule: string
    message: string
    refs: number
}

export type ControlHotspotCandidate = {
    surface: string
    explicitOwner: boolean
    effectRefs: number
}

const emptyOwnerFiles = new Set<string>()

const controllerOwnerRules: readonly ControllerOwnerRule[] = [
    {
        rule: 'realtime-event-controller-owner',
        message: 'createRealtimeEventController must stay inside the single realtime connection owner chain',
        patterns: [/\bcreateRealtimeEventController\s*\(/g],
        ownerFiles: new Set(['web/src/lib/realtimeEventController.ts', 'web/src/hooks/useRealtimeConnection.ts']),
    },
    {
        rule: 'realtime-invalidation-batch-owner',
        message: 'createRealtimeInvalidationBatch must stay inside the realtime event controller owner',
        patterns: [/\bcreateRealtimeInvalidationBatch\s*\(/g],
        ownerFiles: new Set(['web/src/lib/realtimeInvalidationBatch.ts', 'web/src/lib/realtimeEventController.ts']),
    },
    {
        rule: 'transcript-scroll-owner',
        message: 'useTranscriptVirtuoso must stay inside the single transcript scroll owner chain',
        patterns: [/\buseTranscriptVirtuoso\s*\(/g],
        ownerFiles: new Set([
            'web/src/components/AssistantChat/useTranscriptVirtuoso.ts',
            'web/src/components/AssistantChat/VibyThread.tsx',
        ]),
    },
    {
        rule: 'transcript-history-owner',
        message: 'useTranscriptHistoryNavigation must stay inside the approved transcript history owner chain',
        patterns: [/\buseTranscriptHistoryNavigation\s*\(/g],
        ownerFiles: new Set([
            'web/src/components/AssistantChat/useTranscriptVirtuoso.ts',
            'web/src/components/AssistantChat/useTranscriptHistoryNavigation.ts',
        ]),
    },
    {
        rule: 'message-window-async-owner',
        message: 'loadMessageWindowStoreAsyncModule must stay inside approved message window runtime owners',
        patterns: [/\bloadMessageWindowStoreAsyncModule\s*\(/g],
        ownerFiles: new Set([
            'web/src/lib/messageWindowStoreModule.ts',
            'web/src/hooks/queries/useMessages.ts',
            'web/src/routes/sessions/postSwitchSendRecovery.ts',
        ]),
    },
    {
        rule: 'message-window-sync-owner',
        message: 'loadMessageWindowStoreModule must stay inside approved message window cleanup/cache owners',
        patterns: [/\bloadMessageWindowStoreModule\s*\(/g],
        ownerFiles: new Set([
            'web/src/lib/messageWindowStoreModule.ts',
            'web/src/hooks/queries/sessionViewRuntime.ts',
            'web/src/lib/sessionQueryCache.ts',
        ]),
    },
    {
        rule: 'session-view-runtime-owner',
        message: 'disposeSessionViewRuntime must stay inside the selected-session runtime owner chain',
        patterns: [/\bdisposeSessionViewRuntime\s*\(/g],
        ownerFiles: new Set([
            'web/src/hooks/queries/sessionViewRuntime.ts',
            'web/src/routes/sessions/SessionsShell.tsx',
        ]),
    },
    {
        rule: 'json-body-validator-owner',
        message: 'createJsonBodyValidator must stay inside approved route validation owners',
        patterns: [/\bcreateJsonBodyValidator\s*\(/g],
        ownerFiles: new Set([
            'hub/src/web/routes/sessionRouteSupport.ts',
            'pairing/src/http.ts',
            'pairing/src/httpReconnectRoutes.ts',
        ]),
        ownerPrefixes: ['hub/src/web/routes/'],
    },
] as const

export type GovernanceSourceMetrics = {
    typedAnyRefs: number
    rawButtonRefs: number
    rawInputRefs: number
    rawTextareaRefs: number
    rawSelectRefs: number
    designMagicRefs: number
    consoleRefs: number
    fireAndForgetRefs: number
    controllerOwnerViolationRefs: number
    unownedControlSurfaceRefs: number
}

const typedAnyPatterns = [/\bas\s+any\b/g, /:\s*any\b/g, /<\s*any\s*>/g, /=\s*any\b/g, /\bz\.any\s*\(/g] as const
const controlKeywordPattern =
    /\b(controller|runtime|coordinator|manager|scheduler|orchestrator|viewport|lifecycle|recovery|history|bridge|watcher|tracker|transition|control)\b/i
const controlKeywordTokens = new Set([
    'controller',
    'runtime',
    'coordinator',
    'manager',
    'scheduler',
    'orchestrator',
    'viewport',
    'lifecycle',
    'recovery',
    'history',
    'bridge',
    'watcher',
    'tracker',
    'transition',
    'control',
])
const controlEffectPatterns = [
    /\buseEffect\s*\(/g,
    /\buseLayoutEffect\s*\(/g,
    /\baddEventListener\s*\(/g,
    /\brequestAnimationFrame\s*\(/g,
    /\bsetTimeout\s*\(/g,
    /\bsetInterval\s*\(/g,
    /\bscrollTo\s*\(/g,
    /\bscrollIntoView\s*\(/g,
    /\binvalidateQueries\s*\(/g,
    /\bnavigate\s*\(/g,
    /\blocalStorage\b/g,
    /\bsessionStorage\b/g,
    /\bnew\s+WebSocket\b/g,
    /\bemit\s*\(/g,
    /\bsubscribe\s*\(/g,
    /\bunsubscribe\s*\(/g,
    /\bAbortController\b/g,
] as const
const controlStemLeadingNoise = new Set([
    'use',
    'create',
    'resolve',
    'build',
    'get',
    'set',
    'load',
    'read',
    'write',
    'run',
    'start',
    'stop',
    'init',
])
const controlStemTrailingNoise = new Set([
    'controller',
    'runtime',
    'coordinator',
    'manager',
    'scheduler',
    'orchestrator',
    'lifecycle',
    'recovery',
    'history',
    'actions',
    'action',
    'targets',
    'target',
    'support',
    'helper',
    'helpers',
    'contracts',
    'contract',
    'types',
    'type',
    'store',
    'state',
    'cache',
    'tracker',
    'transition',
    'watcher',
    'bridge',
    'facade',
    'service',
    'controls',
    'control',
    'model',
])

function countMatches(source: string, patterns: readonly RegExp[]): number {
    return patterns.reduce((total, pattern) => total + [...source.matchAll(pattern)].length, 0)
}

function countSinglePattern(source: string, pattern: RegExp): number {
    return [...source.matchAll(pattern)].length
}

function isConsoleOwnerPath(repoPath: string): boolean {
    return consoleOwnerFiles.has(repoPath) || consoleOwnerPrefixes.some((prefix) => repoPath.startsWith(prefix))
}

function isFireAndForgetOwnerPath(repoPath: string): boolean {
    return (
        fireAndForgetOwnerFiles.has(repoPath) ||
        fireAndForgetOwnerPrefixes.some((prefix) => repoPath.startsWith(prefix))
    )
}

function countDesignMagicRefs(repoPath: string, source: string): number {
    if (!repoPath.startsWith('web/src/') || repoPath.endsWith('.css')) {
        return 0
    }

    const arbitraryUtilityRe =
        /\b(?:rounded|text|tracking|min-h|min-w|max-w|max-h|h|w|px|py|pt|pb|pl|pr|gap|mt|mr|mb|ml|top|right|bottom|left)-\[(.+?)\]/g
    let count = 0
    for (const match of source.matchAll(arbitraryUtilityRe)) {
        const value = match[1] ?? ''
        if (
            value.includes('var(--ds-') ||
            value.includes('var(--app-') ||
            value.includes('color-mix(') ||
            value.includes('calc(') ||
            value.includes('env(')
        ) {
            continue
        }
        count += 1
    }

    return count
}

function countConsoleRefs(repoPath: string, source: string): number {
    if (isConsoleOwnerPath(repoPath)) {
        return 0
    }

    return countSinglePattern(source, /\bconsole\.(?:log|info|warn|error|debug|clear)\s*\(/g)
}

function countFireAndForgetRefs(repoPath: string, source: string): number {
    if (isFireAndForgetOwnerPath(repoPath)) {
        return 0
    }

    const isBackendSource =
        repoPath.startsWith('cli/src/') ||
        repoPath.startsWith('hub/src/') ||
        repoPath.startsWith('pairing/src/') ||
        repoPath.startsWith('shared/src/')
    const voidPromiseRefs = isBackendSource
        ? countSinglePattern(source, /(?:^|[;{(\n]\s*)void\s+(?:this\.)?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/gm)
        : 0
    const emptyCatchRefs = countSinglePattern(source, /\.catch\(\s*\(\)\s*=>\s*(?:\{\s*\}|null\b)\s*\)/g)
    return voidPromiseRefs + emptyCatchRefs
}

export function collectGovernanceSourceMetrics(repoPath: string, source: string): GovernanceSourceMetrics {
    const isWebSource = repoPath.startsWith('web/src/') && !repoPath.endsWith('.css')
    const controlHotspotCandidate = collectControlHotspotCandidate(repoPath, source)
    return {
        typedAnyRefs: countMatches(source, typedAnyPatterns),
        rawButtonRefs:
            isWebSource && !rawButtonOwnerFiles.has(repoPath)
                ? countSinglePattern(source, /<button\b|role=["']button["']/g)
                : 0,
        rawInputRefs: isWebSource && !rawInputOwnerFiles.has(repoPath) ? countSinglePattern(source, /<input\b/g) : 0,
        rawTextareaRefs:
            isWebSource && !rawTextareaOwnerFiles.has(repoPath) ? countSinglePattern(source, /<textarea\b/g) : 0,
        rawSelectRefs: isWebSource && !rawSelectOwnerFiles.has(repoPath) ? countSinglePattern(source, /<select\b/g) : 0,
        designMagicRefs: countDesignMagicRefs(repoPath, source),
        consoleRefs: countConsoleRefs(repoPath, source),
        fireAndForgetRefs: countFireAndForgetRefs(repoPath, source),
        controllerOwnerViolationRefs: collectControllerOwnerViolations(repoPath, source).reduce(
            (total, violation) => total + violation.refs,
            0
        ),
        unownedControlSurfaceRefs: controlHotspotCandidate && !controlHotspotCandidate.explicitOwner ? 1 : 0,
    }
}

function isControllerOwnerPath(rule: ControllerOwnerRule, repoPath: string): boolean {
    const ownerFiles = rule.ownerFiles ?? emptyOwnerFiles
    return ownerFiles.has(repoPath) || (rule.ownerPrefixes ?? []).some((prefix) => repoPath.startsWith(prefix))
}

export function isExplicitControllerOwnerPath(repoPath: string): boolean {
    return (
        explicitControlSurfaceOwnerFiles.has(repoPath) ||
        controllerOwnerRules.some((rule) => isControllerOwnerPath(rule, repoPath))
    )
}

export function collectControllerOwnerViolations(repoPath: string, source: string): ControllerOwnerViolation[] {
    if (/\.test\./.test(repoPath) || repoPath.includes('/__fixtures__/')) {
        return []
    }

    const violations: ControllerOwnerViolation[] = []
    for (const rule of controllerOwnerRules) {
        if (isControllerOwnerPath(rule, repoPath)) {
            continue
        }

        const refs = countMatches(source, rule.patterns)
        if (refs === 0) {
            continue
        }

        violations.push({
            rule: rule.rule,
            message: rule.message,
            refs,
        })
    }

    return violations
}

function deriveControlSurfaceContainer(repoPath: string): string {
    const segments = repoPath.split('/')
    const dirs = segments.slice(0, -1)
    return dirs.slice(0, Math.min(dirs.length, 4)).join('/')
}

function splitControlStemTokens(repoPath: string): string[] {
    const baseName =
        repoPath
            .split('/')
            .at(-1)
            ?.replace(/\.[^.]+$/, '') ?? ''
    return baseName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_.]+/g, ' ')
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
}

function deriveControlSurfaceStem(repoPath: string): string {
    let tokens = splitControlStemTokens(repoPath)
    while (tokens.length > 1 && controlStemLeadingNoise.has(tokens[0] ?? '')) {
        tokens = tokens.slice(1)
    }
    while (tokens.length > 1 && controlStemTrailingNoise.has(tokens[tokens.length - 1] ?? '')) {
        tokens = tokens.slice(0, -1)
    }
    if (tokens.length === 0) {
        tokens = splitControlStemTokens(repoPath)
    }
    return tokens.slice(0, 2).join('-')
}

function countControlEffectRefs(source: string): number {
    return countMatches(source, controlEffectPatterns)
}

function hasControlKeyword(repoPath: string, source: string): boolean {
    if (controlKeywordPattern.test(source)) {
        return true
    }
    return splitControlStemTokens(repoPath).some((token) => controlKeywordTokens.has(token))
}

export function collectControlHotspotCandidate(repoPath: string, source: string): ControlHotspotCandidate | null {
    if (/\.test\./.test(repoPath) || repoPath.includes('/__fixtures__/') || repoPath.endsWith('.css')) {
        return null
    }

    const effectRefs = countControlEffectRefs(source)
    if (effectRefs === 0) {
        return null
    }

    if (!hasControlKeyword(repoPath, source)) {
        return null
    }

    return {
        surface: `${deriveControlSurfaceContainer(repoPath)}#${deriveControlSurfaceStem(repoPath)}`,
        explicitOwner: isExplicitControllerOwnerPath(repoPath),
        effectRefs,
    }
}

export function isZodOwnerPath(repoPath: string): boolean {
    return zodOwnerFiles.has(repoPath) || zodOwnerPrefixes.some((prefix) => repoPath.startsWith(prefix))
}

export function isSqlOwnerPath(repoPath: string): boolean {
    return sqlOwnerPrefixes.some((prefix) => repoPath.startsWith(prefix))
}
