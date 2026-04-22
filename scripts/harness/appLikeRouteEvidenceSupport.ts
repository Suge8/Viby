export type AppLikeRouteProbeFrame = {
    atMs: number
    pathname: string
    surface: string
    bodyTextLength: number
    sessionChatCount: number
    sessionsListPaneCount: number
    heroLoading: boolean
    routePending: boolean
    detailPending: boolean
    loginVisible: boolean
    routeSurfaceTransparent: boolean
}

export type AppLikeRouteFlowSummary = {
    frameCount: number
    sampledPathnames: string[]
    finalPathname: string
    finalSurface: string
    blankFrameCount: number
    multiListPaneFrameCount: number
    multiChatSurfaceFrameCount: number
    heroLoadingFrameCount: number
    loginVisibleFrameCount: number
    routePendingFrameCount: number
    detailPendingFrameCount: number
    routeSurfaceTransparentFrameCount: number
}

const APP_LIKE_BLANK_FRAME_TEXT_THRESHOLD = 24

export function summarizeAppLikeRouteFlow(frames: readonly AppLikeRouteProbeFrame[]): AppLikeRouteFlowSummary {
    const sampledPathnames: string[] = []
    let blankFrameCount = 0
    let multiListPaneFrameCount = 0
    let multiChatSurfaceFrameCount = 0
    let heroLoadingFrameCount = 0
    let loginVisibleFrameCount = 0
    let routePendingFrameCount = 0
    let detailPendingFrameCount = 0
    let routeSurfaceTransparentFrameCount = 0

    for (const frame of frames) {
        if (!sampledPathnames.includes(frame.pathname)) {
            sampledPathnames.push(frame.pathname)
        }
        if (frame.heroLoading) {
            heroLoadingFrameCount += 1
        }
        if (frame.sessionsListPaneCount > 1) {
            multiListPaneFrameCount += 1
        }
        if (frame.sessionChatCount > 1) {
            multiChatSurfaceFrameCount += 1
        }
        if (frame.loginVisible) {
            loginVisibleFrameCount += 1
        }
        if (frame.routePending) {
            routePendingFrameCount += 1
        }
        if (frame.detailPending) {
            detailPendingFrameCount += 1
        }
        if (frame.routeSurfaceTransparent) {
            routeSurfaceTransparentFrameCount += 1
        }
        if (isBlankLikeFrame(frame)) {
            blankFrameCount += 1
        }
    }

    const finalFrame = frames[frames.length - 1]
    return {
        frameCount: frames.length,
        sampledPathnames,
        finalPathname: finalFrame?.pathname ?? '',
        finalSurface: finalFrame?.surface ?? 'unknown',
        blankFrameCount,
        multiListPaneFrameCount,
        multiChatSurfaceFrameCount,
        heroLoadingFrameCount,
        loginVisibleFrameCount,
        routePendingFrameCount,
        detailPendingFrameCount,
        routeSurfaceTransparentFrameCount,
    }
}

export function getAppLikeRouteFlowFailureReasons(summary: AppLikeRouteFlowSummary): string[] {
    const reasons: string[] = []
    if (summary.blankFrameCount > 0) {
        reasons.push(`blank-like frames: ${summary.blankFrameCount}`)
    }
    if (summary.multiListPaneFrameCount > 0) {
        reasons.push(`multi list panes: ${summary.multiListPaneFrameCount}`)
    }
    if (summary.multiChatSurfaceFrameCount > 0) {
        reasons.push(`multi chat surfaces: ${summary.multiChatSurfaceFrameCount}`)
    }
    if (summary.heroLoadingFrameCount > 0) {
        reasons.push(`hero loading frames: ${summary.heroLoadingFrameCount}`)
    }
    if (summary.loginVisibleFrameCount > 0) {
        reasons.push(`login-visible frames: ${summary.loginVisibleFrameCount}`)
    }
    if (summary.routeSurfaceTransparentFrameCount > 0) {
        reasons.push(`transparent route surface frames: ${summary.routeSurfaceTransparentFrameCount}`)
    }
    return reasons
}

export function formatAppLikeEvidenceSummary(options: {
    targetUrl: string
    finalUrl: string
    outputDir: string
    consoleErrors: number
    runtimeExceptions: number
    logErrors: number
    networkFailures: number
    controllerConflicts: number
    flowSummaries: ReadonlyArray<{
        id: string
        summary: AppLikeRouteFlowSummary
        screenshotPath: string
        allowLoginVisible?: boolean
    }>
    extraSummaryLines?: readonly string[]
}): string {
    return [
        '# App-Like Route Evidence Summary',
        '',
        `- Target: ${options.targetUrl}`,
        `- Final URL: ${options.finalUrl}`,
        `- Artifact dir: ${options.outputDir}`,
        `- Console errors: ${options.consoleErrors}`,
        `- Runtime exceptions: ${options.runtimeExceptions}`,
        `- Log errors: ${options.logErrors}`,
        `- Network failures: ${options.networkFailures}`,
        `- Controller conflicts: ${options.controllerConflicts}`,
        ...(options.extraSummaryLines ?? []),
        '',
        '## Flows',
        '',
        ...options.flowSummaries.flatMap((flow) => {
            const reasons = getAppLikeRouteFlowFailureReasons(flow.summary).filter(
                (reason) => !(flow.allowLoginVisible && reason.startsWith('login-visible frames:'))
            )
            return [
                `### ${flow.id}`,
                `- Final path: ${flow.summary.finalPathname}`,
                `- Final surface: ${flow.summary.finalSurface}`,
                `- Sampled paths: ${flow.summary.sampledPathnames.join(' -> ')}`,
                `- Blank-like frames: ${flow.summary.blankFrameCount}`,
                `- Multi list pane frames: ${flow.summary.multiListPaneFrameCount}`,
                `- Multi chat surface frames: ${flow.summary.multiChatSurfaceFrameCount}`,
                `- Hero loading frames: ${flow.summary.heroLoadingFrameCount}`,
                `- Login-visible frames: ${flow.summary.loginVisibleFrameCount}`,
                `- Route pending frames: ${flow.summary.routePendingFrameCount}`,
                `- Detail pending frames: ${flow.summary.detailPendingFrameCount}`,
                `- Transparent route surface frames: ${flow.summary.routeSurfaceTransparentFrameCount}`,
                ...(flow.allowLoginVisible ? ['- Login-visible allowed: yes'] : []),
                `- Screenshot: ${flow.screenshotPath}`,
                `- Failure reasons: ${reasons.length > 0 ? reasons.join('; ') : 'none'}`,
                '',
            ]
        }),
        '## Failure rule',
        '',
        '- console error => fail',
        '- runtime exception => fail',
        '- log error => fail',
        '- network failure except ERR_ABORTED/canceled => fail',
        '- controller conflict => fail',
        '- blank-like frame => fail',
        '- multiple sessions list panes in one frame => fail',
        '- multiple session-chat surfaces in one frame => fail',
        '- hero loading frame => fail',
        '- login-visible frame during warm route flows => fail',
        '- transparent route surface frame => fail',
        '',
    ].join('\n')
}

function isBlankLikeFrame(frame: AppLikeRouteProbeFrame): boolean {
    return frame.surface === 'unknown' && frame.bodyTextLength < APP_LIKE_BLANK_FRAME_TEXT_THRESHOLD
}
