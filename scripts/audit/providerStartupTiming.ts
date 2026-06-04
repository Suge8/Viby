import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROVIDER_IMPORTS = [
    { driver: 'claude', specifier: './src/claude/runClaude.ts' },
    { driver: 'codex', specifier: './src/codex/runCodex.ts' },
    { driver: 'gemini', specifier: './src/gemini/runGemini.ts' },
    { driver: 'opencode', specifier: './src/opencode/runOpencode.ts' },
    { driver: 'pi', specifier: './src/pi/runPi.ts' },
    { driver: 'cursor', specifier: './src/cursor/runCursor.ts' },
    { driver: 'copilot', specifier: './src/copilot/runCopilot.ts' },
] as const

export type ProviderImportTiming = {
    driver: string
    durationsMs: number[]
    medianMs: number
    minMs: number
    maxMs: number
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const appCoreDir = join(repoRoot, 'app-core')
const DEFAULT_REPEAT = 3
const DEFAULT_TIMEOUT_MS = 10_000

export function median(values: readonly number[]): number {
    if (values.length === 0) throw new Error('median requires at least one value')
    const sorted = [...values].sort((left, right) => left - right)
    return sorted[Math.floor(sorted.length / 2)] ?? sorted[0]
}

export function summarizeTiming(driver: string, durationsMs: number[]): ProviderImportTiming {
    if (durationsMs.length === 0) throw new Error(`No timing samples for ${driver}`)
    return {
        driver,
        durationsMs,
        medianMs: median(durationsMs),
        minMs: Math.min(...durationsMs),
        maxMs: Math.max(...durationsMs),
    }
}

export function parseRepeatArg(argv: readonly string[]): number {
    const raw = argv.find((arg) => arg.startsWith('--repeat='))?.slice('--repeat='.length)
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_REPEAT
}

function measureOne(specifier: string): number {
    const expression = `const startedAt=performance.now();await import(${JSON.stringify(specifier)});console.log(Math.round(performance.now()-startedAt))`
    const result = spawnSync('bun', ['-e', expression], {
        cwd: appCoreDir,
        encoding: 'utf8',
        timeout: DEFAULT_TIMEOUT_MS,
        killSignal: 'SIGKILL',
    })
    if (result.error) throw result.error
    if (result.status !== 0)
        throw new Error(result.stderr.trim() || result.stdout.trim() || `import failed: ${specifier}`)
    const parsed = Number(result.stdout.trim().split('\n').at(-1))
    if (!Number.isFinite(parsed)) throw new Error(`Invalid timing output for ${specifier}: ${result.stdout}`)
    return parsed
}

export function measureProviderImportTimings(repeat: number): ProviderImportTiming[] {
    return PROVIDER_IMPORTS.map(({ driver, specifier }) => {
        const durationsMs = Array.from({ length: repeat }, () => measureOne(specifier))
        return summarizeTiming(driver, durationsMs)
    })
}

function main(): void {
    const repeat = parseRepeatArg(process.argv.slice(2))
    const timings = measureProviderImportTimings(repeat)
    const outputDir = resolve(repoRoot, process.env.VIBY_PROVIDER_TIMING_OUT_DIR || 'app-core/.artifacts')
    mkdirSync(outputDir, { recursive: true })
    const report = { generatedAt: new Date().toISOString(), repeat, timings }
    const outputPath = join(outputDir, 'provider-startup-timing.json')
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    for (const timing of timings) {
        console.log(`${timing.driver}: median ${timing.medianMs}ms (${timing.durationsMs.join(', ')}ms)`)
    }
    console.log(`Report: ${outputPath}`)
}

if (import.meta.main) main()
