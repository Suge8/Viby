import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type ContractSnapshot = {
    existingPaths: readonly string[]
    files: Record<string, string>
}

export type PairingPwaContractViolation = {
    file: string
    rule: string
    message: string
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')

const inspectedFiles = [
    'package.json',
    'shared/src/pairing/pairingWorkspaceRoute.ts',
    'pairing/src/http.ts',
    'pairing/src/httpPwaManifest.ts',
    'pairing/src/httpPwaManifest.test.ts',
    'pairing/src/http.test.ts',
    'web/src/hooks/usePWAInstall.ts',
    'web/src/sw.ts',
    'web/src/components/AppController.tsx',
    'web/src/remote/RemotePwaBootstrap.tsx',
    'web/src/remote/RemotePairingControllerView.tsx',
    'web/src/remote/RemotePairingController.test.tsx',
    'web/src/remote/remotePairingPwaHandoffWarmup.ts',
    'web/src/remote/remotePairingPwaHandoffWarmup.test.tsx',
]

const removedOwnerPaths = [
    'web/src/lib/pwaInstallHandoff.ts',
    'web/src/lib/swManifestHandoffSync.ts',
    'web/src/lib/swPwaHandoffInterceptor.ts',
    'web/src/remote/remotePairingLaunch.ts',
]

const requiredFragments = [
    {
        file: 'shared/src/pairing/pairingWorkspaceRoute.ts',
        fragment: "export const PAIRING_PWA_MANIFEST_PAIRING_PARAM = 'pairing'",
        message: 'shared contract must own the manifest pairing query name',
    },
    {
        file: 'shared/src/pairing/pairingWorkspaceRoute.ts',
        fragment: "export const PAIRING_PWA_HANDOFF_PARAM = 'handoff'",
        message: 'shared contract must own the launch handoff query name',
    },
    {
        file: 'pairing/src/http.ts',
        fragment: '[PAIRING_PWA_MANIFEST_PAIRING_PARAM]: pairingId',
        message: '/p HTML manifest injection must use the shared pairing query constant',
    },
    {
        file: 'pairing/src/http.ts',
        fragment: 'suppressManifest: isPwaHandoffLaunch(c.req.url)',
        message: 'handoff launch HTML must strip the manifest link so it cannot rotate the one-shot ticket',
    },
    {
        file: 'pairing/src/httpPwaManifest.ts',
        fragment: "const DEFAULT_START_URL = '/sessions?remote=1'",
        message: 'unbound manifests must land on the remote workspace shell, not broker JSON or root',
    },
    {
        file: 'pairing/src/httpPwaManifest.ts',
        fragment: 'queryUrl.searchParams.get(PAIRING_PWA_MANIFEST_PAIRING_PARAM)',
        message: 'manifest personalization must read the pairing id from the URL query',
    },
    {
        file: 'pairing/src/httpPwaManifest.ts',
        fragment: 'new URLSearchParams({ [PAIRING_PWA_HANDOFF_PARAM]: handoffTicket })',
        message: 'manifest start_url must mint a one-shot handoff query',
    },
    {
        file: 'pairing/src/httpPwaManifest.ts',
        fragment: "options.personalized ? 'no-store'",
        message: 'personalized manifests must not be cached',
    },
    {
        file: 'web/src/remote/remotePairingPwaHandoffWarmup.ts',
        fragment: 'searchParams.set(PAIRING_PWA_MANIFEST_PAIRING_PARAM, pairingId)',
        message: 'ready remote workspace must bind the current manifest URL to the pairing id',
    },
    {
        file: 'web/src/remote/remotePairingPwaHandoffWarmup.ts',
        fragment: 'createRemotePwaHandoff(props.pairingId)',
        message: 'warmup must still refresh the broker cookie for back-compat PWA recovery',
    },
    {
        file: 'web/src/remote/RemotePairingControllerView.tsx',
        fragment: "props.pathname.startsWith('/sessions') ? props.pathname : '/sessions'",
        message: '/p handoff with retained ready must render workspace through normalized route semantics',
    },
    {
        file: 'web/src/remote/RemotePwaBootstrap.tsx',
        fragment: "history.replace(withPairingWorkspaceIntent('/sessions'))",
        message: 'PWA recovery must hand off directly to the remote workspace route',
    },
    {
        file: 'web/src/remote/RemotePwaBootstrap.tsx',
        fragment: 'recoverRemotePairingFromCookie()',
        message: 'standalone fallback must keep the cookie recovery path',
    },
]

const requiredTestFragments = [
    {
        file: 'pairing/src/httpPwaManifest.test.ts',
        fragment: 'honours the path-based pairing query',
        message: 'broker manifest query personalization must have regression coverage',
    },
    {
        file: 'pairing/src/http.test.ts',
        fragment: 'does not expose a manifest link during PWA handoff launch',
        message: 'handoff launch manifest stripping must have regression coverage',
    },
    {
        file: 'web/src/remote/remotePairingPwaHandoffWarmup.test.tsx',
        fragment: 'binds the manifest URL to the current pairing',
        message: 'web warmup manifest binding must have regression coverage',
    },
    {
        file: 'web/src/remote/RemotePairingController.test.tsx',
        fragment: 'renders the retained workspace during `/p` handoff while the URL is normalized',
        message: '/p retained-ready handoff must have regression coverage',
    },
]

const forbiddenFragments = [
    {
        file: 'web/src/hooks/usePWAInstall.ts',
        fragment: 'createRemotePwaHandoff',
        message: 'install affordance must not become a second handoff owner',
    },
    {
        file: 'web/src/hooks/usePWAInstall.ts',
        fragment: 'history.replaceState',
        message: 'install affordance must not mutate the launch URL',
    },
    {
        file: 'web/src/sw.ts',
        fragment: 'manifest.webmanifest',
        message: 'service worker must not intercept or personalize the PWA manifest',
    },
]

function readSnapshot(): ContractSnapshot {
    const paths = [...inspectedFiles, ...removedOwnerPaths]
    return {
        existingPaths: paths.filter((path) => existsSync(join(repoRoot, path))),
        files: Object.fromEntries(
            inspectedFiles
                .filter((path) => existsSync(join(repoRoot, path)))
                .map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')])
        ),
    }
}

function readFile(snapshot: ContractSnapshot, file: string, violations: PairingPwaContractViolation[]): string {
    const content = snapshot.files[file]
    if (content !== undefined) return content
    violations.push({ file, rule: 'missing-file', message: 'required PWA contract file is missing' })
    return ''
}

function requireFragment(
    snapshot: ContractSnapshot,
    rule: { file: string; fragment: string; message: string },
    violations: PairingPwaContractViolation[]
): void {
    if (!readFile(snapshot, rule.file, violations).includes(rule.fragment)) {
        violations.push({ file: rule.file, rule: 'required-fragment', message: rule.message })
    }
}

function forbidFragment(
    snapshot: ContractSnapshot,
    rule: { file: string; fragment: string; message: string },
    violations: PairingPwaContractViolation[]
): void {
    if (readFile(snapshot, rule.file, violations).includes(rule.fragment)) {
        violations.push({ file: rule.file, rule: 'forbidden-fragment', message: rule.message })
    }
}

function requireQueryBeforeCookie(snapshot: ContractSnapshot, violations: PairingPwaContractViolation[]): void {
    const file = 'pairing/src/httpPwaManifest.ts'
    const content = readFile(snapshot, file, violations)
    const ownerStart = content.indexOf('function resolvePairingIdFromRequest')
    const ownerBody = ownerStart === -1 ? content : content.slice(ownerStart)
    const queryIndex = ownerBody.indexOf('queryUrl.searchParams.get(PAIRING_PWA_MANIFEST_PAIRING_PARAM)')
    const cookieIndex = ownerBody.indexOf('readPairingManifestCookieValue')
    if (queryIndex === -1 || cookieIndex === -1 || queryIndex > cookieIndex) {
        violations.push({
            file,
            rule: 'manifest-resolution-order',
            message: 'manifest must prefer URL pairing query before cookie fallback',
        })
    }
}

function requirePackageScripts(snapshot: ContractSnapshot, violations: PairingPwaContractViolation[]): void {
    const packageJson = readFile(snapshot, 'package.json', violations)
    if (!packageJson.includes('"harness:pairing-pwa"')) {
        violations.push({ file: 'package.json', rule: 'missing-script', message: 'missing harness:pairing-pwa' })
    }
    if (!packageJson.includes('harness:pairing-pwa && bun run harness:quality:gate')) {
        violations.push({
            file: 'package.json',
            rule: 'harness-check-coverage',
            message: 'harness:check must run the PWA handoff contract before quality gate',
        })
    }
}

export function evaluatePairingPwaContract(snapshot: ContractSnapshot): PairingPwaContractViolation[] {
    const violations: PairingPwaContractViolation[] = []
    for (const rule of [...requiredFragments, ...requiredTestFragments]) requireFragment(snapshot, rule, violations)
    for (const rule of forbiddenFragments) forbidFragment(snapshot, rule, violations)
    for (const path of removedOwnerPaths) {
        if (snapshot.existingPaths.includes(path)) {
            violations.push({
                file: path,
                rule: 'removed-owner-returned',
                message: 'legacy handoff owner must stay deleted',
            })
        }
    }
    requireQueryBeforeCookie(snapshot, violations)
    requirePackageScripts(snapshot, violations)
    return violations
}

if (import.meta.main) {
    const violations = evaluatePairingPwaContract(readSnapshot())
    if (violations.length > 0) {
        for (const violation of violations) {
            console.error(`${violation.file}: ${violation.rule}: ${violation.message}`)
        }
        process.exit(1)
    }
    console.log('pairing PWA handoff contract ok')
}
