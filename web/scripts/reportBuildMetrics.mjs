import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_DIR = new URL('../dist', import.meta.url)
const ASSETS_DIR = new URL('../dist/assets', import.meta.url)
const REPORT_DIR = new URL('../.artifacts/build-metrics', import.meta.url)
const TOP_FILE_LIMIT = 12

const CHUNK_BUDGETS = [
    {
        label: 'main-index-js',
        pattern: /^index-.*\.js$/,
        maxRawBytes: 440 * 1024,
        maxGzipBytes: 140 * 1024,
    },
    {
        label: 'main-index-css',
        pattern: /^index-.*\.css$/,
        maxRawBytes: 130 * 1024,
        maxGzipBytes: 25 * 1024,
    },
    {
        label: 'vendor-react',
        pattern: /^vendor-react-.*\.js$/,
        maxRawBytes: 220 * 1024,
        maxGzipBytes: 70 * 1024,
    },
    {
        label: 'vendor-tanstack',
        pattern: /^vendor-tanstack-.*\.js$/,
        maxRawBytes: 260 * 1024,
        maxGzipBytes: 75 * 1024,
    },
    {
        label: 'vendor-ui',
        pattern: /^vendor-ui-.*\.js$/,
        maxRawBytes: 180 * 1024,
        maxGzipBytes: 45 * 1024,
    },
    {
        label: 'vendor-motion',
        pattern: /^vendor-motion-.*\.js$/,
        maxRawBytes: 80 * 1024,
        maxGzipBytes: 28 * 1024,
    },
    {
        label: 'vendor-terminal',
        pattern: /^vendor-terminal-.*\.js$/,
        maxRawBytes: 600 * 1024,
        maxGzipBytes: 130 * 1024,
    },
    {
        label: 'session-chat-workspace',
        pattern: /^SessionChatWorkspace-.*\.js$/,
        maxRawBytes: 170 * 1024,
        maxGzipBytes: 45 * 1024,
        allowMissing: true,
    },
    {
        label: 'viby-thread',
        pattern: /^VibyThread-.*\.js$/,
        maxRawBytes: 80 * 1024,
        maxGzipBytes: 25 * 1024,
        allowMissing: true,
    },
    {
        label: 'viby-composer',
        pattern: /^VibyComposer-.*\.js$/,
        maxRawBytes: 60 * 1024,
        maxGzipBytes: 20 * 1024,
        allowMissing: true,
    },
    {
        label: 'markdown-runtime',
        pattern: /^(markdown-text|MarkdownPrimitive|MarkdownRenderer)-.*\.js$/,
        maxRawBytes: 380 * 1024,
        maxGzipBytes: 75 * 1024,
    },
    {
        label: 'shiki-code-content',
        pattern: /^ShikiCodeContent-.*\.js$/,
        maxRawBytes: 330 * 1024,
        maxGzipBytes: 75 * 1024,
    },
]

const ABSENT_CHUNK_BUDGETS = [
    {
        label: 'motion-runtime',
        pattern: /^use-reduced-motion-.*\.js$/,
    },
]

function formatKiB(bytes) {
    return `${(bytes / 1024).toFixed(2)} KiB`
}

function listAssetFiles() {
    if (!existsSync(ASSETS_DIR)) {
        throw new Error(`Missing build assets directory: ${ASSETS_DIR.pathname}`)
    }

    return readdirSync(ASSETS_DIR)
        .filter((name) => !name.startsWith('.'))
        .map((name) => {
            const filePath = join(ASSETS_DIR.pathname, name)
            const content = readFileSync(filePath)
            return {
                name,
                rawBytes: content.byteLength,
                gzipBytes: gzipSync(content).byteLength,
            }
        })
        .sort((left, right) => right.rawBytes - left.rawBytes)
}

function resolveBudgetResult(files, budget) {
    const matchedFile = files.find((file) => budget.pattern.test(file.name))
    if (!matchedFile) {
        return {
            label: budget.label,
            status: budget.allowMissing === true ? 'pass' : 'missing',
            details:
                budget.allowMissing === true
                    ? `No asset matched ${budget.pattern}; budget skipped because chunk is now optional`
                    : `No asset matched ${budget.pattern}`,
        }
    }

    const failures = []
    if (matchedFile.rawBytes > budget.maxRawBytes) {
        failures.push(`raw ${formatKiB(matchedFile.rawBytes)} > ${formatKiB(budget.maxRawBytes)}`)
    }
    if (matchedFile.gzipBytes > budget.maxGzipBytes) {
        failures.push(`gzip ${formatKiB(matchedFile.gzipBytes)} > ${formatKiB(budget.maxGzipBytes)}`)
    }

    return {
        label: budget.label,
        status: failures.length === 0 ? 'pass' : 'fail',
        file: matchedFile.name,
        rawBytes: matchedFile.rawBytes,
        gzipBytes: matchedFile.gzipBytes,
        details:
            failures.length === 0
                ? `raw ${formatKiB(matchedFile.rawBytes)}, gzip ${formatKiB(matchedFile.gzipBytes)}`
                : failures.join('; '),
    }
}

function resolveAbsentBudgetResult(files, budget) {
    const matchedFile = files.find((file) => budget.pattern.test(file.name))
    return matchedFile
        ? {
              label: budget.label,
              status: 'fail',
              file: matchedFile.name,
              rawBytes: matchedFile.rawBytes,
              gzipBytes: matchedFile.gzipBytes,
              details: `Unexpected asset present: ${matchedFile.name}`,
          }
        : {
              label: budget.label,
              status: 'pass',
              details: 'No matching asset present',
          }
}

function writeReports(report) {
    mkdirSync(REPORT_DIR, { recursive: true })
    writeFileSync(join(REPORT_DIR.pathname, 'build-metrics.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

    const markdownLines = [
        '# Web Build Metrics',
        '',
        `- generated_at: ${report.generatedAt}`,
        '',
        '## Top Assets',
        '',
        '| asset | raw | gzip |',
        '| --- | ---: | ---: |',
        ...report.topAssets.map(
            (asset) => `| ${asset.name} | ${formatKiB(asset.rawBytes)} | ${formatKiB(asset.gzipBytes)} |`
        ),
        '',
        '## Budget Results',
        '',
        '| label | status | file | details |',
        '| --- | --- | --- | --- |',
        ...report.budgetResults.map(
            (result) => `| ${result.label} | ${result.status} | ${result.file ?? '-'} | ${result.details} |`
        ),
        '',
    ]
    writeFileSync(join(REPORT_DIR.pathname, 'build-metrics.md'), `${markdownLines.join('\n')}\n`, 'utf8')
}

function main() {
    const shouldCheckBudgets = process.argv.includes('--check')
    const files = listAssetFiles()
    const budgetResults = [
        ...CHUNK_BUDGETS.map((budget) => resolveBudgetResult(files, budget)),
        ...ABSENT_CHUNK_BUDGETS.map((budget) => resolveAbsentBudgetResult(files, budget)),
    ]

    const report = {
        generatedAt: new Date().toISOString(),
        topAssets: files.slice(0, TOP_FILE_LIMIT),
        budgetResults,
    }

    if (!existsSync(DIST_DIR)) {
        throw new Error(`Missing build directory: ${DIST_DIR.pathname}`)
    }

    writeReports(report)

    console.log('Top build assets:')
    for (const asset of report.topAssets) {
        console.log(`- ${asset.name}: raw ${formatKiB(asset.rawBytes)}, gzip ${formatKiB(asset.gzipBytes)}`)
    }

    console.log('\nBuild budget results:')
    for (const result of budgetResults) {
        console.log(`- [${result.status}] ${result.label}${result.file ? ` (${result.file})` : ''}: ${result.details}`)
    }

    if (shouldCheckBudgets) {
        const failed = budgetResults.filter((result) => result.status === 'fail')
        if (failed.length > 0) {
            throw new Error(`Build budget check failed for ${failed.map((result) => result.label).join(', ')}`)
        }
    }
}

main()
