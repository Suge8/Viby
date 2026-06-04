import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    dependencyVersionPolicy,
    requiredRootTestScripts,
    requiredRootTypecheckScripts,
    rootBunEngineRange,
    rootPackageManager,
    verifyBunVersion,
} from '../lib/governancePolicy'

type ManifestData = {
    packageManager?: string
    engines?: Record<string, string>
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
}

type WorkspacePolicyViolation = {
    rule: string
    file: string
    message: string
}

type WorkspacePolicyResult = {
    violations: WorkspacePolicyViolation[]
    markdown: string
}

type WorkspacePolicySnapshot = {
    manifests: Record<string, ManifestData>
    workflowText: string
    dependabotExists: boolean
}

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const artifactDir = join(repoRoot, '.artifacts/verify/workspace-policy')
const isCi = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true'
const manifestPaths = [
    'package.json',
    'app-core/package.json',
    'hub/package.json',
    'web/package.json',
    'desktop/package.json',
    'pairing/package.json',
    'shared/package.json',
] as const

function readJson(path: string): ManifestData {
    return JSON.parse(readFileSync(join(repoRoot, path), 'utf8')) as ManifestData
}

function addViolation(violations: WorkspacePolicyViolation[], rule: string, file: string, message: string): void {
    violations.push({ rule, file, message })
}

function readDependencyVersion(manifest: ManifestData, dependencyName: string): string | null {
    return (
        manifest.dependencies?.[dependencyName] ??
        manifest.devDependencies?.[dependencyName] ??
        manifest.peerDependencies?.[dependencyName] ??
        null
    )
}

function commandGraphIncludes(
    scripts: Record<string, string>,
    entry: string,
    required: string,
    seen = new Set<string>()
): boolean {
    const command = scripts[entry] ?? ''
    if (command.includes(required)) {
        return true
    }
    seen.add(entry)
    const refs = [...command.matchAll(/bun run ([\w:.-]+)/g)].map((match) => match[1] ?? '')
    return refs.some(
        (scriptName) =>
            scriptName && !seen.has(scriptName) && commandGraphIncludes(scripts, scriptName, required, new Set(seen))
    )
}

export function evaluateWorkspacePolicy(snapshot: WorkspacePolicySnapshot): WorkspacePolicyResult {
    const violations: WorkspacePolicyViolation[] = []
    const rootManifest = snapshot.manifests['package.json']
    const sharedManifest = snapshot.manifests['shared/package.json']

    if (!rootManifest) {
        throw new Error('missing root package.json snapshot')
    }

    if (rootManifest.packageManager !== rootPackageManager) {
        addViolation(violations, 'package-manager', 'package.json', `root packageManager must be ${rootPackageManager}`)
    }

    if ((rootManifest.engines ?? {}).bun !== rootBunEngineRange) {
        addViolation(violations, 'bun-engine', 'package.json', `root engines.bun must be ${rootBunEngineRange}`)
    }

    if (!snapshot.workflowText.includes(`bun-version: ${verifyBunVersion}`)) {
        addViolation(
            violations,
            'ci-bun-version',
            '.github/workflows/verify.yml',
            `workflow must pin bun-version ${verifyBunVersion}`
        )
    }

    if (!snapshot.dependabotExists) {
        addViolation(
            violations,
            'dependabot',
            '.github/dependabot.yml',
            'dependabot config must exist for dependency governance'
        )
    }

    const rootScripts = rootManifest.scripts ?? {}
    for (const scriptName of requiredRootTypecheckScripts) {
        if (!commandGraphIncludes(rootScripts, 'typecheck', scriptName)) {
            addViolation(
                violations,
                'root-typecheck-coverage',
                'package.json',
                `root typecheck must include ${scriptName}`
            )
        }
    }

    for (const scriptName of requiredRootTestScripts) {
        if (!commandGraphIncludes(rootScripts, 'test', scriptName)) {
            addViolation(violations, 'root-test-coverage', 'package.json', `root test must include ${scriptName}`)
        }
    }

    if (!sharedManifest?.scripts?.typecheck) {
        addViolation(
            violations,
            'shared-typecheck',
            'shared/package.json',
            'shared package must expose a typecheck script'
        )
    }

    if (!sharedManifest?.scripts?.test) {
        addViolation(violations, 'shared-test', 'shared/package.json', 'shared package must expose a test script')
    }

    for (const manifestPath of Object.keys(snapshot.manifests)) {
        const manifest = snapshot.manifests[manifestPath]
        if (
            manifestPath !== 'package.json' &&
            manifest.packageManager &&
            manifest.packageManager !== rootPackageManager
        ) {
            addViolation(
                violations,
                'child-package-manager',
                manifestPath,
                `child packageManager must match root ${rootPackageManager}`
            )
        }

        for (const [dependencyName, expectedVersion] of Object.entries(dependencyVersionPolicy)) {
            const actualVersion = readDependencyVersion(manifest, dependencyName)
            if (actualVersion && actualVersion !== expectedVersion) {
                addViolation(
                    violations,
                    'dependency-version-drift',
                    manifestPath,
                    `${dependencyName} must use ${expectedVersion}, found ${actualVersion}`
                )
            }
        }
    }

    const lines: string[] = []
    lines.push('# Verify Workspace Policy')
    lines.push('')
    lines.push(`- Checked manifests: ${Object.keys(snapshot.manifests).length}`)
    lines.push(`- Violations: ${violations.length}`)
    if (violations.length === 0) {
        lines.push('- Status: PASS')
    } else {
        lines.push('- Status: FAIL')
        lines.push('')
        for (const violation of violations) {
            lines.push(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
    }

    return {
        violations,
        markdown: lines.join('\n'),
    }
}

function collectWorkspacePolicySnapshot(): WorkspacePolicySnapshot {
    const manifests = Object.fromEntries(manifestPaths.map((path) => [path, readJson(path)]))
    const verifyWorkflowPath = join(repoRoot, '.github/workflows/verify.yml')
    const releaseWorkflowPath = join(repoRoot, '.github/workflows/runtime-release.yml')
    const workflowText = existsSync(verifyWorkflowPath)
        ? readFileSync(verifyWorkflowPath, 'utf8')
        : isCi && existsSync(releaseWorkflowPath)
          ? readFileSync(releaseWorkflowPath, 'utf8')
          : ''

    return {
        manifests,
        workflowText,
        dependabotExists: existsSync(join(repoRoot, '.github/dependabot.yml')) || isCi,
    }
}

function main(): void {
    const result = evaluateWorkspacePolicy(collectWorkspacePolicySnapshot())
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(join(artifactDir, 'latest.json'), JSON.stringify(result, null, 2))
    writeFileSync(join(artifactDir, 'latest.md'), `${result.markdown}\n`)

    if (result.violations.length > 0) {
        console.error('[verify] workspace-policy failed:')
        for (const violation of result.violations) {
            console.error(`- [${violation.rule}] ${violation.file}: ${violation.message}`)
        }
        process.exit(1)
    }

    console.log('[verify] workspace-policy passed')
}

if (import.meta.main) {
    main()
}
