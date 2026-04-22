import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_AGENT_BROWSER_TIMEOUT_MS = 12_000
const DEFAULT_PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS = 15_000
const PLAYWRIGHT_SCREENSHOT_FILENAME = 'screenshot-playwright.png'

export type AgentBrowserCommandResult = {
    stdout: string
    stderr: string
}

export type BrowserSmokeScreenshotResult = {
    output: string
    owner: 'agent-browser' | 'playwright'
    mode: 'full' | 'viewport'
    fallbackReason?: string
    artifactPath?: string
}

type RunAgentBrowserCommandOptions = {
    profileDir: string
    timeoutMs?: number
}

export function resolveBrowserSmokeProfileDir(explicitProfileDir?: string): { profileDir: string; managed: boolean } {
    const trimmedProfileDir = explicitProfileDir?.trim()
    if (trimmedProfileDir) {
        return {
            profileDir: trimmedProfileDir,
            managed: false,
        }
    }

    return {
        profileDir: mkdtempSync(join(tmpdir(), 'viby-browser-profile.')),
        managed: true,
    }
}

export function runAgentBrowserCommand(
    repoRoot: string,
    args: string[],
    options: RunAgentBrowserCommandOptions
): AgentBrowserCommandResult {
    const timeoutMs = options.timeoutMs ?? DEFAULT_AGENT_BROWSER_TIMEOUT_MS
    const renderedArgs = ['--profile', options.profileDir, ...args]
    const result = spawnSync('agent-browser', renderedArgs, {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
    })
    const stdout = result.stdout.trim()
    const stderr = result.stderr.trim()

    if (result.error) {
        const error = result.error as NodeJS.ErrnoException
        const details = stderr || stdout || error.message
        if (error.code === 'ETIMEDOUT') {
            throw new Error(
                `agent-browser ${renderedArgs.join(' ')} timed out after ${timeoutMs}ms\n${details || 'no output'}`
            )
        }

        throw new Error(`agent-browser ${renderedArgs.join(' ')} failed\n${details || 'unknown error'}`)
    }

    if (result.status !== 0) {
        throw new Error(`agent-browser ${renderedArgs.join(' ')} failed\n${stderr || stdout || 'unknown error'}`)
    }

    return { stdout, stderr }
}

export function closeAgentBrowserDaemon(repoRoot: string): void {
    const result = spawnSync('agent-browser', ['close'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: DEFAULT_AGENT_BROWSER_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    })

    if (result.error) {
        const error = result.error as NodeJS.ErrnoException
        if (error.code === 'ETIMEDOUT') {
            throw new Error(`agent-browser close timed out after ${DEFAULT_AGENT_BROWSER_TIMEOUT_MS}ms`)
        }
    }

    if (result.status !== 0) {
        const rendered = result.stderr.trim() || result.stdout.trim()
        throw new Error(`agent-browser close failed\n${rendered || 'unknown error'}`)
    }
}

export async function captureBrowserSmokeScreenshot(options: {
    outputDir: string
    repoRoot: string
    profileDir: string
    pageUrl: string
    timeoutMs?: number
}): Promise<BrowserSmokeScreenshotResult> {
    try {
        const result = runAgentBrowserCommand(
            options.repoRoot,
            ['screenshot', '--full', '--screenshot-dir', options.outputDir],
            {
                profileDir: options.profileDir,
                timeoutMs: options.timeoutMs,
            }
        )
        return {
            output: result.stdout,
            owner: 'agent-browser',
            mode: 'full',
        }
    } catch (fullError) {
        try {
            const result = runAgentBrowserCommand(
                options.repoRoot,
                ['screenshot', '--screenshot-dir', options.outputDir],
                {
                    profileDir: options.profileDir,
                    timeoutMs: options.timeoutMs,
                }
            )
            return {
                output: result.stdout,
                owner: 'agent-browser',
                mode: 'viewport',
                fallbackReason: `full capture unavailable: ${summarizeError(fullError)}`,
            }
        } catch (viewportError) {
            const playwrightCapture = await capturePlaywrightScreenshot({
                pageUrl: options.pageUrl,
                outputDir: options.outputDir,
                timeoutMs: options.timeoutMs,
            })
            return {
                output: playwrightCapture.artifactPath,
                owner: 'playwright',
                mode: playwrightCapture.mode,
                artifactPath: playwrightCapture.artifactPath,
                fallbackReason: `agent-browser capture unavailable: ${summarizeError(fullError)} | ${summarizeError(viewportError)}`,
            }
        }
    }
}

async function capturePlaywrightScreenshot(options: {
    pageUrl: string
    outputDir: string
    timeoutMs?: number
}): Promise<{ artifactPath: string; mode: 'full' | 'viewport' }> {
    const { chromium } = await import('playwright-core')
    const screenshotProfileDir = resolveBrowserSmokeProfileDir().profileDir
    const executablePath = resolveChromeExecutablePath()
    const context = await chromium.launchPersistentContext(screenshotProfileDir, {
        executablePath,
        headless: true,
        viewport: {
            width: 1280,
            height: 720,
        },
        ignoreHTTPSErrors: true,
        args: [
            '--disable-background-networking',
            '--disable-component-update',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    })

    try {
        const page = context.pages()[0] ?? (await context.newPage())
        const timeoutMs = options.timeoutMs ?? DEFAULT_PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS
        await page.goto(options.pageUrl, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        })
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
        await page.waitForTimeout(1_000)

        const artifactPath = join(options.outputDir, PLAYWRIGHT_SCREENSHOT_FILENAME)
        await page.screenshot({ path: artifactPath })
        return { artifactPath, mode: 'viewport' }
    } finally {
        await context.close()
    }
}

function summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.split('\n')[0] || 'unknown error'
}

export function resolveChromeExecutablePath(): string {
    const browserRoot = join(homedir(), '.agent-browser', 'browsers')
    const chromeDir = readdirSync(browserRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('chrome-'))
        .sort((left, right) => right.name.localeCompare(left.name))
        .map((entry) =>
            join(
                browserRoot,
                entry.name,
                'Google Chrome for Testing.app',
                'Contents',
                'MacOS',
                'Google Chrome for Testing'
            )
        )
        .find((candidate) => existsSync(candidate))

    if (!chromeDir) {
        throw new Error('failed to locate Chrome for Testing for Playwright screenshot fallback')
    }

    return chromeDir
}
