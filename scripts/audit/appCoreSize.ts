import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type PackageSize = { packageName: string; bytes: number }
export type AppCoreSizeReport = {
    generatedAt: string
    executableBytes: number | null
    bundledExecutableBytes: number | null
    topPackages: PackageSize[]
}

type BunMetafile = {
    inputs?: Record<string, { bytes?: number }>
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const APP_CORE_EXECUTABLE = 'app-core/dist-exe/bun-darwin-arm64/viby-app-core'
const BUNDLED_APP_CORE_EXECUTABLE =
    'desktop/src-tauri/target/release/bundle/macos/Viby.app/Contents/MacOS/viby-app-core'
const TOP_PACKAGE_LIMIT = 20

function fileSize(repoPath: string): number | null {
    const absolute = resolve(repoRoot, repoPath)
    return existsSync(absolute) ? statSync(absolute).size : null
}

function packageNameFromInput(inputPath: string): string | null {
    const marker = '/node_modules/'
    const index = inputPath.lastIndexOf(marker)
    if (index === -1) return null
    const rest = inputPath.slice(index + marker.length)
    return rest.startsWith('@') ? rest.split('/').slice(0, 2).join('/') : (rest.split('/')[0] ?? null)
}

export function collectPackageSizes(metafile: BunMetafile, limit = TOP_PACKAGE_LIMIT): PackageSize[] {
    const totals = new Map<string, number>()
    for (const [inputPath, input] of Object.entries(metafile.inputs ?? {})) {
        const packageName = packageNameFromInput(inputPath)
        if (!packageName) continue
        totals.set(packageName, (totals.get(packageName) ?? 0) + (input.bytes ?? 0))
    }
    return [...totals.entries()]
        .map(([packageName, bytes]) => ({ packageName, bytes }))
        .sort((left, right) => right.bytes - left.bytes)
        .slice(0, limit)
}

export function buildSizeReport(metafile: BunMetafile | null): AppCoreSizeReport {
    return {
        generatedAt: new Date().toISOString(),
        executableBytes: fileSize(APP_CORE_EXECUTABLE),
        bundledExecutableBytes: fileSize(BUNDLED_APP_CORE_EXECUTABLE),
        topPackages: metafile ? collectPackageSizes(metafile) : [],
    }
}

async function generateMetafile(): Promise<BunMetafile> {
    const outputDir = await mkdtemp(join(tmpdir(), 'viby-appcore-size.'))
    const metafilePath = join(outputDir, 'meta.json')
    try {
        const result = spawnSync(
            'bun',
            [
                'build',
                'src/appCoreBootstrap.ts',
                '--target',
                'bun',
                '--outdir',
                outputDir,
                `--metafile=${metafilePath}`,
            ],
            { cwd: resolve(repoRoot, 'app-core'), encoding: 'utf8', timeout: 120_000, killSignal: 'SIGKILL' }
        )
        if (result.error) throw result.error
        if (result.status !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || 'bun build failed')
        return JSON.parse(readFileSync(metafilePath, 'utf8')) as BunMetafile
    } finally {
        rmSync(outputDir, { recursive: true, force: true })
    }
}

function formatBytes(bytes: number | null): string {
    if (bytes === null) return 'missing'
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

async function main(): Promise<void> {
    const withTrace = process.argv.includes('--trace')
    const metafile = withTrace ? await generateMetafile() : null
    const report = buildSizeReport(metafile)
    const outputDir = resolve(repoRoot, process.env.VIBY_APP_CORE_SIZE_OUT_DIR || 'app-core/.artifacts')
    mkdirSync(outputDir, { recursive: true })
    const outputPath = join(outputDir, 'app-core-size-report.json')
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`AppCore executable: ${formatBytes(report.executableBytes)}`)
    console.log(`Bundled AppCore executable: ${formatBytes(report.bundledExecutableBytes)}`)
    for (const pkg of report.topPackages.slice(0, 10)) {
        console.log(`${pkg.packageName}: ${(pkg.bytes / 1024).toFixed(1)} KiB`)
    }
    console.log(`Report: ${outputPath}`)
}

if (import.meta.main) await main()
