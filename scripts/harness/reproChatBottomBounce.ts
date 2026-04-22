import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../../hub/src/store'
import { seedRuntimeAndSessions } from './appLikeRouteBrowserSeedSupport'
import {
    type IsolatedBrowserApp,
    launchObservedMobileBrowser,
    startIsolatedBrowserApp,
    stopProcess,
} from './browserIsolatedAppSupport'
import {
    buildAssistantMarkdownWithImage,
    buildLongAssistantTranscriptText as buildLongAssistantText,
    createTranscriptTextMessage as createTextMessage,
} from './transcriptSeedSupport'

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const timestamp = new Date().toISOString().replaceAll(':', '-')
const outputDir = resolve(repoRoot, `web/.artifacts/harness/${timestamp}-chat-bottom-bounce-repro`)
const CLI_API_TOKEN = `viby-bounce-repro-${timestamp}`
const HUB_READY_TIMEOUT_MS = 60_000
const WEB_READY_TIMEOUT_MS = 60_000
const ROUTE_SETTLE_TIMEOUT_MS = 15_000
const SESSION_NAME = 'Bottom Bounce Repro'
const RUNTIME_ID = 'bounce-repro-runtime'
const SOURCE_SESSION_ID = process.env.VIBY_REPRO_SOURCE_SESSION_ID ?? null
const SOURCE_DB_PATH =
    process.env.VIBY_REPRO_SOURCE_DB_PATH?.replace(/^~/, homedir()) ?? join(homedir(), '.viby', 'viby.db')
const SOURCE_LIMIT = Number.parseInt(process.env.VIBY_REPRO_SOURCE_LIMIT ?? '200', 10)
const SAMPLE_COUNT = Number.parseInt(process.env.VIBY_REPRO_SAMPLE_COUNT ?? '24', 10)
const SAMPLE_INTERVAL_MS = Number.parseInt(process.env.VIBY_REPRO_SAMPLE_INTERVAL_MS ?? '120', 10)
const LIVE_WEB_URL = process.env.VIBY_REPRO_WEB_URL ?? null
const LIVE_HUB_URL = process.env.VIBY_REPRO_HUB_URL ?? null
const LIVE_SESSION_ID = process.env.VIBY_REPRO_LIVE_SESSION_ID ?? null
const LIVE_ACCESS_TOKEN = process.env.VIBY_REPRO_ACCESS_TOKEN ?? null

type GeometrySnapshot = {
    label: string
    timeMs?: number
    scrollTop: number
    scrollHeight: number
    clientHeight: number
    maxOffset: number
    composerTop: number | null
    composerHeight: number | null
    composerReservedSpace: string | null
    viewportPaddingBottom: string | null
    lastRowBottom: number | null
    viewportBottom: number | null
    occludedPx: number | null
    rowCount: number
}

async function pause(ms: number): Promise<void> {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

function seedTranscriptFromSource(options: {
    sourceDbPath: string
    sourceSessionId: string
    sourceLimit: number
    targetDbPath: string
    targetSessionId: string
}): { copied: number } {
    const sourceStore = new Store(options.sourceDbPath)
    const targetStore = new Store(options.targetDbPath)
    const messages = sourceStore.messages
        .getMessages(options.sourceSessionId, Math.max(1, options.sourceLimit))
        .map((message) => ({
            content: message.content,
            createdAt: message.createdAt,
            localId: message.localId ?? undefined,
        }))

    targetStore.messages.addMessages(options.targetSessionId, messages)
    targetStore.sessions.setSessionAlive(options.targetSessionId, Date.now())

    return { copied: messages.length }
}

function seedTranscript(dbPath: string, sessionId: string): void {
    const store = new Store(dbPath)
    const imageAttachment = {
        id: randomUUID(),
        filename: 'drawing.png',
        mimeType: 'image/png',
        size: 2048,
        path: '/tmp/drawing.png',
        previewUrl: '/agent-codex.png',
    }

    const messages: Array<{ content: unknown; createdAt: number }> = []
    let createdAt = Date.now() - 60_000

    for (let index = 0; index < 10; index += 1) {
        messages.push({
            content: createTextMessage('user', `User turn ${index + 1}`),
            createdAt,
        })
        createdAt += 100
        messages.push({
            content: createTextMessage(
                'agent',
                index === 7 ? buildAssistantMarkdownWithImage(index + 1) : buildLongAssistantText(index + 1)
            ),
            createdAt,
        })
        createdAt += 100
    }

    messages.push({
        content: createTextMessage('user', 'Image payload', [imageAttachment]),
        createdAt,
    })
    createdAt += 100
    messages.push({
        content: createTextMessage('agent', buildLongAssistantText(11)),
        createdAt,
    })
    createdAt += 100
    messages.push({
        content: createTextMessage('agent', `${buildLongAssistantText(12)}\n\nFinal assistant bubble.`),
        createdAt,
    })

    store.messages.addMessages(sessionId, messages)
    store.sessions.setSessionAlive(sessionId, Date.now())
}

async function captureGeometry(page: import('playwright-core').Page, label: string): Promise<GeometrySnapshot> {
    return await page.evaluate((snapshotLabel) => {
        const viewport = document.querySelector('.session-chat-thread-viewport') as HTMLElement | null
        const composer = document.querySelector('.session-chat-composer-shell') as HTMLElement | null
        const layout = document.querySelector('.session-chat-layout') as HTMLElement | null
        const rows = Array.from(document.querySelectorAll('.ds-transcript-row')) as HTMLElement[]
        const lastRow = rows.at(-1) ?? null

        if (!viewport) {
            throw new Error('Viewport not found')
        }

        const viewportRect = viewport.getBoundingClientRect()
        const composerRect = composer?.getBoundingClientRect() ?? null
        const lastRowRect = lastRow?.getBoundingClientRect() ?? null
        const viewportStyle = getComputedStyle(viewport)
        const layoutStyle = layout ? getComputedStyle(layout) : null
        const maxOffset = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        const occludedPx = composerRect && lastRowRect ? Math.max(0, lastRowRect.bottom - composerRect.top) : null

        return {
            label: snapshotLabel,
            scrollTop: viewport.scrollTop,
            scrollHeight: viewport.scrollHeight,
            clientHeight: viewport.clientHeight,
            maxOffset,
            composerTop: composerRect?.top ?? null,
            composerHeight: composerRect?.height ?? null,
            composerReservedSpace: layoutStyle?.getPropertyValue('--chat-composer-reserved-space').trim() ?? null,
            viewportPaddingBottom: viewportStyle.paddingBottom,
            lastRowBottom: lastRowRect?.bottom ?? null,
            viewportBottom: viewportRect.bottom,
            occludedPx,
            rowCount: rows.length,
        }
    }, label)
}

async function captureGeometrySeries(page: import('playwright-core').Page): Promise<GeometrySnapshot[]> {
    const samples: GeometrySnapshot[] = []
    const startedAt = Date.now()

    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
        const sample = await captureGeometry(page, `sample-${index + 1}`)
        samples.push({
            ...sample,
            timeMs: Date.now() - startedAt,
        })
        if (index < SAMPLE_COUNT - 1) {
            await pause(SAMPLE_INTERVAL_MS)
        }
    }

    return samples
}

async function main(): Promise<void> {
    mkdirSync(outputDir, { recursive: true })
    let app: IsolatedBrowserApp | null = null
    let context: import('playwright-core').BrowserContext | null = null
    let page: import('playwright-core').Page | null = null
    const browserProfileDir = join(outputDir, 'browser-profile')
    mkdirSync(browserProfileDir, { recursive: true })

    try {
        const liveMode = Boolean(LIVE_WEB_URL && LIVE_HUB_URL && LIVE_SESSION_ID && LIVE_ACCESS_TOKEN)
        let sessionId = LIVE_SESSION_ID
        let webUrl = LIVE_WEB_URL
        let hubUrl = LIVE_HUB_URL
        let accessToken = LIVE_ACCESS_TOKEN
        let sourceCopy: { copied: number } | null = null

        if (!liveMode) {
            app = await startIsolatedBrowserApp({
                cliApiToken: CLI_API_TOKEN,
                hubReadyTimeoutMs: HUB_READY_TIMEOUT_MS,
                outputDir,
                repoRoot,
                webReadyTimeoutMs: WEB_READY_TIMEOUT_MS,
            })

            const seeded = await seedRuntimeAndSessions({
                alphaSessionName: SESSION_NAME,
                betaSessionName: 'Unused Session',
                cliApiToken: CLI_API_TOKEN,
                hubUrl: app.hubUrl,
                outputDir,
                runtimeId: RUNTIME_ID,
                vibyHomeDir: app.vibyHomeDir,
            })

            const targetDbPath = join(app.vibyHomeDir, 'viby.db')
            sourceCopy =
                SOURCE_SESSION_ID && SOURCE_DB_PATH
                    ? seedTranscriptFromSource({
                          sourceDbPath: SOURCE_DB_PATH,
                          sourceSessionId: SOURCE_SESSION_ID,
                          sourceLimit: SOURCE_LIMIT,
                          targetDbPath,
                          targetSessionId: seeded.alphaSessionId,
                      })
                    : null

            if (!sourceCopy) {
                seedTranscript(targetDbPath, seeded.alphaSessionId)
            }

            sessionId = seeded.alphaSessionId
            webUrl = app.webUrl
            hubUrl = app.hubUrl
            accessToken = CLI_API_TOKEN
        }

        if (!sessionId || !webUrl || !hubUrl || !accessToken) {
            throw new Error('Missing session/browser configuration')
        }

        ;({ context, page } = await launchObservedMobileBrowser({
            browserProfileDir: app?.browserProfileDir ?? browserProfileDir,
            buckets: {
                consoleErrors: [],
                runtimeExceptions: [],
                logErrors: [],
                networkFailures: [],
                networkRequests: [],
            },
            outputDir,
        }))

        const url = `${webUrl}/sessions/${sessionId}?hub=${encodeURIComponent(hubUrl)}`
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: ROUTE_SETTLE_TIMEOUT_MS })
        await page.locator('input[name="accessToken"]').waitFor({ timeout: ROUTE_SETTLE_TIMEOUT_MS })
        await page.locator('input[name="accessToken"]').fill(accessToken)
        await page.locator('button[type="submit"]').click()
        await page.locator('.session-chat-thread-viewport').waitFor({ timeout: ROUTE_SETTLE_TIMEOUT_MS })
        await pause(1500)

        const viewportSelector = '.session-chat-thread-viewport'
        await page.locator(viewportSelector).evaluate((element) => {
            element.scrollTop = element.scrollHeight
        })
        await pause(200)
        const immediate = await captureGeometry(page, 'after-direct-bottom')

        await page.locator(viewportSelector).evaluate((element) => {
            element.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
        const samples = await captureGeometrySeries(page)
        const settled = await captureGeometry(page, 'after-settle')

        await page.screenshot({ path: join(outputDir, 'final.png') })
        writeFileSync(
            join(outputDir, 'geometry.json'),
            `${JSON.stringify(
                {
                    sourceSessionId: SOURCE_SESSION_ID,
                    sourceDbPath: liveMode ? null : SOURCE_SESSION_ID ? SOURCE_DB_PATH : null,
                    sourceLimit: liveMode ? null : SOURCE_SESSION_ID ? SOURCE_LIMIT : null,
                    liveMode,
                    liveSessionId: liveMode ? LIVE_SESSION_ID : null,
                    copiedMessages: sourceCopy?.copied ?? null,
                    immediate,
                    samples,
                    settled,
                },
                null,
                2
            )}\n`
        )
        writeFileSync(
            join(outputDir, 'summary.md'),
            [
                `- URL: ${url}`,
                `- Live mode: ${liveMode ? 'yes' : 'no'}`,
                `- Live session: ${liveMode ? LIVE_SESSION_ID : 'n/a'}`,
                `- Source session: ${SOURCE_SESSION_ID ?? 'synthetic seed'}`,
                `- Source DB: ${SOURCE_SESSION_ID ? SOURCE_DB_PATH : 'n/a'}`,
                `- Copied messages: ${sourceCopy?.copied ?? 'n/a'}`,
                `- Immediate scrollTop/maxOffset: ${immediate.scrollTop} / ${immediate.maxOffset}`,
                `- Settled scrollTop/maxOffset: ${settled.scrollTop} / ${settled.maxOffset}`,
                `- Immediate occludedPx: ${immediate.occludedPx}`,
                `- Settled occludedPx: ${settled.occludedPx}`,
                `- Max sample occludedPx: ${Math.max(...samples.map((sample) => sample.occludedPx ?? 0))}`,
                `- ScrollTop deltas observed: ${samples.map((sample) => sample.scrollTop).join(', ')}`,
                `- MaxOffset deltas observed: ${samples.map((sample) => sample.maxOffset).join(', ')}`,
                `- Artifacts: ${outputDir}`,
            ].join('\n') + '\n'
        )

        console.log(outputDir)
    } finally {
        if (context) {
            await context.close().catch(() => {})
        }
        await stopProcess(app?.webProcess ?? null)
        await stopProcess(app?.hubProcess ?? null)
    }
}

await main()
