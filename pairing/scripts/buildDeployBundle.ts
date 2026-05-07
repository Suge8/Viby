import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
    chmodSync,
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    buildDeployReadme,
    buildHealthCheckScript,
    buildLogrotateConfig,
    buildRunScript,
    buildServiceTemplate,
} from './deployBundleTemplates'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const pairingRoot = dirname(scriptDir)
const repoRoot = dirname(pairingRoot)
const bundleDir = join(pairingRoot, 'deploy-bundle')
const archivePath = join(pairingRoot, 'deploy-bundle.tar.gz')
const archiveChecksumPath = join(pairingRoot, 'deploy-bundle.sha256')

function assertFileExists(path: string, message: string): void {
    if (!existsSync(path)) {
        throw new Error(message)
    }
}

function ensureBundleDir(): void {
    rmSync(bundleDir, { force: true, recursive: true })
    mkdirSync(bundleDir, { recursive: true })
}

function copyBundleFile(fromPath: string, toName: string): void {
    copyFileSync(fromPath, join(bundleDir, toName))
}

function copyWebAppDist(): void {
    const webDist = join(repoRoot, 'web', 'dist')
    const webIndex = join(webDist, 'index.html')
    const webAssets = join(webDist, 'assets')

    assertFileExists(webIndex, 'Missing web/dist/index.html. Run `bun run --cwd web build` first.')
    assertFileExists(webAssets, 'Missing web/dist/assets. Run `bun run --cwd web build` first.')

    copyBundleFile(webIndex, 'web-index.html')
    cpSync(webAssets, join(bundleDir, 'assets'), { recursive: true })
    for (const entry of readdirSync(webDist, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name === 'index.html' || entry.name === '404.html') {
            continue
        }
        copyBundleFile(join(webDist, entry.name), entry.name)
    }
}

function writeBundleFile(name: string, content: string, mode?: number): void {
    const targetPath = join(bundleDir, name)
    writeFileSync(targetPath, content)
    if (typeof mode === 'number') {
        chmodSync(targetPath, mode)
    }
}

function writeBundleArchive(): void {
    rmSync(archivePath, { force: true })
    rmSync(archiveChecksumPath, { force: true })
    stripExtendedAttributes()
    execFileSync('tar', ['--no-xattrs', '-czf', archivePath, '-C', pairingRoot, 'deploy-bundle'], {
        env: { ...process.env, COPYFILE_DISABLE: '1' },
    })
    const checksum = createHash('sha256').update(readFileSync(archivePath)).digest('hex')
    writeFileSync(archiveChecksumPath, `${checksum}  deploy-bundle.tar.gz\n`)
}

function stripExtendedAttributes(): void {
    try {
        execFileSync('xattr', ['-cr', bundleDir], { stdio: 'ignore' })
    } catch {
        return
    }
}

function main(): void {
    const distFile = join(pairingRoot, 'dist', 'index.js')
    const envExampleFile = join(pairingRoot, '.env.example')
    const brandLogoFile = join(repoRoot, 'web', 'public', 'brand-logo-tight.png')
    const caddyFile = join(repoRoot, 'docs', 'examples', 'Caddyfile.pairing')

    assertFileExists(distFile, 'Missing pairing/dist/index.js. Run `bun run --cwd pairing build` first.')
    assertFileExists(envExampleFile, 'Missing pairing/.env.example')
    assertFileExists(brandLogoFile, 'Missing web/public/brand-logo-tight.png')
    assertFileExists(caddyFile, 'Missing docs/examples/Caddyfile.pairing')

    ensureBundleDir()
    copyBundleFile(distFile, 'index.js')
    copyWebAppDist()
    copyBundleFile(envExampleFile, 'pairing.env.example')
    copyBundleFile(brandLogoFile, 'brand-logo-tight.png')
    copyBundleFile(caddyFile, 'Caddyfile.pairing')
    writeBundleFile('run-pairing.sh', buildRunScript(), 0o755)
    writeBundleFile('viby-pairing.service', buildServiceTemplate())
    writeBundleFile('viby-pairing.logrotate', buildLogrotateConfig())
    writeBundleFile('viby-pairing-health-check.sh', buildHealthCheckScript(), 0o755)
    writeBundleFile('DEPLOY.md', buildDeployReadme(readFileSync(distFile).byteLength))
    writeBundleArchive()
}

main()
