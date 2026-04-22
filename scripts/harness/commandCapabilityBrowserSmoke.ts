import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    type IsolatedBrowserApp,
    postJson,
    type StartedProcess,
    startIsolatedBrowserApp,
    startLoggedProcess,
    stopProcess,
} from './browserIsolatedAppSupport'
import {
    attachToPageTarget,
    CdpClient,
    collectBrowserFailures,
    runAgentBrowser,
    sleep,
    writeBrowserSmokeArtifacts,
} from './browserSmokeSupport'
import { sanitizeArtifactSegment } from './support'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const smokeLabel = sanitizeArtifactSegment(process.env.VIBY_COMMAND_CAPABILITY_SMOKE_LABEL || 'command-capability')
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(
    repoRoot,
    process.env.VIBY_COMMAND_CAPABILITY_SMOKE_OUT_DIR || `web/.artifacts/harness/${timestamp}-${smokeLabel}`
)
const HUB_READY_TIMEOUT_MS = 60_000
const WEB_READY_TIMEOUT_MS = 60_000
const COMMAND_REFRESH_TIMEOUT_MS = 20_000
const CLI_API_TOKEN = process.env.VIBY_COMMAND_CAPABILITY_SMOKE_CLI_API_TOKEN || `viby-smoke-${timestamp}`
const SHARED_VIBY_HOME_DIR = '.viby'

function createTomlCommand(description: string, prompt: string): string {
    return `description = "${description}"\nprompt = """\n${prompt}\n"""\n`
}

function resolveSharedVibyHomeDir(): string | null {
    const homeDir = process.env.HOME
    if (!homeDir) {
        return null
    }

    return join(homeDir, SHARED_VIBY_HOME_DIR)
}

function assertIsolatedVibyHome(vibyHomeDir: string): void {
    const sharedHome = resolveSharedVibyHomeDir()
    if (!sharedHome) {
        return
    }

    if (resolve(vibyHomeDir) === resolve(sharedHome)) {
        throw new Error(`Refusing to run smoke against shared VIBY_HOME: ${sharedHome}`)
    }
}

async function getJson<TResponse>(url: string, options?: { headers?: Record<string, string> }): Promise<TResponse> {
    const response = await fetch(url, {
        method: 'GET',
        headers: options?.headers,
    })

    if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(`Request failed ${response.status} ${response.statusText}: ${body}`)
    }

    return (await response.json()) as TResponse
}

type CommandCapabilitiesApiResponse = {
    success: boolean
    revision?: string
    notModified?: boolean
    capabilities?: Array<{
        trigger: string
        description?: string
        source?: string
    }>
}

async function waitForCommandCapability(options: {
    hubUrl: string
    jwt: string
    sessionId: string
    expectedTrigger: string
    timeoutMs: number
    revision?: string
}): Promise<CommandCapabilitiesApiResponse> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < options.timeoutMs) {
        const params = new URLSearchParams()
        if (options.revision) {
            params.set('revision', options.revision)
        }
        const suffix = params.size > 0 ? `?${params.toString()}` : ''
        const response = await getJson<CommandCapabilitiesApiResponse>(
            `${options.hubUrl}/api/sessions/${options.sessionId}/command-capabilities${suffix}`,
            {
                headers: {
                    authorization: `Bearer ${options.jwt}`,
                },
            }
        )

        if (response.notModified) {
            await sleep(400)
            continue
        }

        if (response.capabilities?.some((capability) => capability.trigger === options.expectedTrigger)) {
            return response
        }

        await sleep(400)
    }

    throw new Error(`Timed out waiting for command capability: ${options.expectedTrigger}`)
}

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })
    const projectDir = join(outputDir, 'project')
    const projectCommandsDir = join(projectDir, '.gemini', 'commands')
    mkdirSync(projectCommandsDir, { recursive: true })
    writeFileSync(
        join(projectCommandsDir, 'launch.toml'),
        createTomlCommand('Launch smoke command', 'Run the initial launch smoke command')
    )

    let app: IsolatedBrowserApp | null = null
    let bridgeProcess: StartedProcess | null = null
    let client: CdpClient | null = null
    let browserSessionId: string | null = null
    let smokeError: unknown = null
    let targetUrlBase = ''

    try {
        app = await startIsolatedBrowserApp({
            cliApiToken: CLI_API_TOKEN,
            hubReadyTimeoutMs: HUB_READY_TIMEOUT_MS,
            outputDir,
            repoRoot,
            webReadyTimeoutMs: WEB_READY_TIMEOUT_MS,
        })
        assertIsolatedVibyHome(app.vibyHomeDir)
        targetUrlBase = `${app.webUrl}/sessions`

        const auth = await postJson<{ token: string }>(`${app.hubUrl}/api/auth`, {
            body: { accessToken: CLI_API_TOKEN },
        })
        const seededSession = await postJson<{
            session: {
                id: string
            }
        }>(`${app.hubUrl}/cli/sessions`, {
            headers: {
                authorization: `Bearer ${CLI_API_TOKEN}`,
            },
            body: {
                tag: 'command-capability-smoke',
                metadata: {
                    path: projectDir,
                    host: '127.0.0.1',
                    driver: 'gemini',
                },
            },
        })
        const sessionId = seededSession.session.id
        const targetUrl = `${targetUrlBase}/${sessionId}?hub=${encodeURIComponent(app.hubUrl)}&token=${encodeURIComponent(CLI_API_TOKEN)}`

        bridgeProcess = startLoggedProcess({
            repoRoot,
            args: ['run', '--cwd', 'cli', 'scripts/sessionCapabilityBridgeSmoke.ts'],
            env: {
                CLI_API_TOKEN,
                VIBY_API_URL: app.hubUrl,
                VIBY_HOME: app.vibyHomeDir,
                VIBY_SMOKE_SESSION_ID: sessionId,
                VIBY_SMOKE_WORKING_DIRECTORY: projectDir,
            },
            logPath: join(outputDir, 'capability-bridge.log'),
        })
        await sleep(2_000)

        runAgentBrowser(repoRoot, ['open', 'about:blank'], { profileDir: app.browserProfileDir })
        const cdpUrl = runAgentBrowser(repoRoot, ['get', 'cdp-url'], { profileDir: app.browserProfileDir })
        client = await CdpClient.connect(cdpUrl)
        browserSessionId = await attachToPageTarget(client)
        await client.send('Runtime.enable', {}, browserSessionId)
        await client.send('Log.enable', {}, browserSessionId)
        await client.send('Network.enable', {}, browserSessionId)
        await client.send('Page.enable', {}, browserSessionId)

        runAgentBrowser(repoRoot, ['open', targetUrl], { profileDir: app.browserProfileDir })
        runAgentBrowser(repoRoot, ['wait', '--load', 'networkidle'], { profileDir: app.browserProfileDir })

        await sleep(1_500)
        const pageReadyUrl = runAgentBrowser(repoRoot, ['get', 'url'], { profileDir: app.browserProfileDir })
        const pageReadyTitle = runAgentBrowser(repoRoot, ['get', 'title'], { profileDir: app.browserProfileDir })
        writeFileSync(join(outputDir, 'page-ready.txt'), `URL: ${pageReadyUrl}\nTitle: ${pageReadyTitle}\n`)

        const initialCapabilities = await waitForCommandCapability({
            hubUrl: app.hubUrl,
            jwt: auth.token,
            sessionId,
            expectedTrigger: '/launch',
            timeoutMs: COMMAND_REFRESH_TIMEOUT_MS,
        })
        writeFileSync(
            join(outputDir, 'slash-capabilities-initial.json'),
            `${JSON.stringify(initialCapabilities, null, 2)}\n`
        )

        writeFileSync(
            join(projectCommandsDir, 'review.toml'),
            createTomlCommand('Review smoke command', 'Run the hot-reloaded review smoke command')
        )

        const updatedCapabilities = await waitForCommandCapability({
            hubUrl: app.hubUrl,
            jwt: auth.token,
            sessionId,
            expectedTrigger: '/review',
            timeoutMs: COMMAND_REFRESH_TIMEOUT_MS,
            revision: initialCapabilities.revision,
        })
        writeFileSync(
            join(outputDir, 'slash-capabilities-updated.json'),
            `${JSON.stringify(updatedCapabilities, null, 2)}\n`
        )

        const snapshot = `URL: ${pageReadyUrl}\nTitle: ${pageReadyTitle}`
        const networkRequests = '(skipped for deterministic isolated smoke)'
        const title = runAgentBrowser(repoRoot, ['get', 'title'], { profileDir: app.browserProfileDir })
        const finalUrl = runAgentBrowser(repoRoot, ['get', 'url'], { profileDir: app.browserProfileDir })
        const screenshotOutput = 'not captured'

        const { consoleErrors, runtimeExceptions, logErrors, networkFailures } = collectBrowserFailures({
            client,
            sessionId: browserSessionId,
        })

        writeBrowserSmokeArtifacts({
            outputDir,
            targetUrl,
            finalUrl,
            title,
            snapshot,
            networkRequests,
            screenshotOutput,
            consoleErrors,
            runtimeExceptions,
            logErrors,
            networkFailures,
            extraSummaryLines: [
                `- Hub URL: ${app.hubUrl}`,
                `- Web URL: ${app.webUrl}`,
                `- Session ID: ${sessionId}`,
                `- Isolated VIBY_HOME: ${app.vibyHomeDir}`,
                `- Isolated browser profile: ${app.browserProfileDir}`,
                `- Initial capability revision: ${initialCapabilities.revision ?? 'missing'}`,
                `- Updated capability revision: ${updatedCapabilities.revision ?? 'missing'}`,
                `- Project dir: ${projectDir}`,
                `- Auth token exchanged: ${auth.token ? 'yes' : 'no'}`,
            ],
        })

        const failureCount = consoleErrors.length + runtimeExceptions.length + logErrors.length + networkFailures.length
        if (failureCount > 0) {
            throw new Error(`Browser smoke recorded ${failureCount} browser failure(s)`)
        }

        console.log(`[harness] command capability browser smoke passed. Artifacts: ${outputDir}`)
    } catch (error) {
        smokeError = error
        if (app && client && browserSessionId) {
            try {
                const finalUrl = runAgentBrowser(repoRoot, ['get', 'url'], { profileDir: app.browserProfileDir })
                const title = runAgentBrowser(repoRoot, ['get', 'title'], { profileDir: app.browserProfileDir })
                const snapshot = `URL: ${finalUrl}\nTitle: ${title}`
                const networkRequests = '(skipped for deterministic isolated smoke)'
                const screenshotOutput = 'not captured'
                const { consoleErrors, runtimeExceptions, logErrors, networkFailures } = collectBrowserFailures({
                    client,
                    sessionId: browserSessionId,
                })
                writeBrowserSmokeArtifacts({
                    outputDir,
                    targetUrl: targetUrlBase,
                    finalUrl,
                    title,
                    snapshot,
                    networkRequests,
                    screenshotOutput,
                    consoleErrors,
                    runtimeExceptions,
                    logErrors,
                    networkFailures,
                    extraSummaryLines: [
                        `- Failure: ${error instanceof Error ? error.message : String(error)}`,
                        `- Isolated VIBY_HOME: ${app.vibyHomeDir}`,
                        `- Isolated browser profile: ${app.browserProfileDir}`,
                    ],
                })
            } catch {
                // Failure artifact capture is best-effort.
            }
        }
        throw error
    } finally {
        client?.close()
        try {
            if (app) {
                runAgentBrowser(repoRoot, ['close'], { profileDir: app.browserProfileDir })
            }
        } catch {
            // Best-effort browser shutdown only.
        }
        await stopProcess(bridgeProcess)
        await stopProcess(app?.webProcess ?? null)
        await stopProcess(app?.hubProcess ?? null)
        if (smokeError) {
            writeFileSync(
                join(outputDir, 'failure.txt'),
                `${smokeError instanceof Error ? `${smokeError.message}\n${smokeError.stack ?? ''}` : String(smokeError)}\n`
            )
        }
    }
}

await main()
