import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export interface SecretFinding {
    path: string
    line: number
    rule: string
    message: string
    sample: string
}

const MAX_SCAN_BYTES = 1_000_000
const REQUIRED_GITIGNORE_PATTERNS = [
    '**/.env',
    '**/.env.*',
    'pairing/deploy-bundle/',
    'pairing/deploy-bundle.tar.gz',
    'pairing/deploy-bundle.sha256',
    '**/dist/',
]
const DENIED_PATHS = [
    /(^|\/)\.env(\.|$)/,
    /(^|\/)pairing\.env$/,
    /(^|\/)deploy-bundle(\/|$)/,
    /(^|\/)dist(\/|$)/,
    /(^|\/)(id_rsa|id_ed25519|.*\.pem|.*\.p12|.*\.pfx|.*\.key)$/i,
]
const SECRET_ENV_ASSIGNMENT =
    /^\s*(?:export\s+)?([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|API_KEY|AUTH_KEY|REDIS_URL)[A-Z0-9_]*)\s*=\s*([^#\n]+)/
const STATIC_AUTH_SECRET = /^\s*static-auth-secret\s*=\s*([^#\n]+)/i
const URL_WITH_PASSWORD = /\b(?:redis|rediss|postgres|postgresql|mysql|mongodb):\/\/(?:[^\s:@]+)?:[^\s@]+@/i
const PRIVATE_KEY_HEADER = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/
const SAFE_VALUE =
    /^(\$|\$\{|\$\{\{|<|replace-|your-|example|test|smoke-|fake|mock|dummy|fixture|changeme|redacted|\*\*\*|null|undefined)/i

function listCandidateFiles(root: string): string[] {
    const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root })
        .toString('utf8')
        .trimEnd()
    return output ? Array.from(new Set(output.split('\0'))).sort() : []
}

function isTextContent(content: Buffer): boolean {
    return !content.includes(0)
}

function cleanValue(raw: string): string {
    return raw
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/,$/, '')
}

function isSafeValue(raw: string, key = ''): boolean {
    const value = cleanValue(raw)
    if (value === '' || SAFE_VALUE.test(value)) {
        return true
    }
    return key.endsWith('REDIS_URL') && /^rediss?:\/\/[^\s@]+$/i.test(value)
}

function redactLine(line: string): string {
    return line.replace(/=\s*([^\s#]+)/g, '= [REDACTED]').replace(/:\/\/(?:[^\s:@]+)?:[^\s@]+@/g, '://[REDACTED]@')
}

function pathFinding(path: string): SecretFinding | null {
    if (path.endsWith('.env.example')) {
        return null
    }
    if (!DENIED_PATHS.some((rule) => rule.test(path))) {
        return null
    }
    return {
        path,
        line: 0,
        rule: 'sensitive-path',
        message: 'Sensitive or generated deployment files must not be committed.',
        sample: path,
    }
}

export function scanSecretContent(path: string, content: string): SecretFinding[] {
    const findings: SecretFinding[] = []
    const lines = content.split(/\r?\n/)
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const lineNo = index + 1
        const envMatch = SECRET_ENV_ASSIGNMENT.exec(line)
        const staticMatch = STATIC_AUTH_SECRET.exec(line)
        const unsafeEnv = envMatch && !isSafeValue(envMatch[2], envMatch[1])
        const unsafeStatic = staticMatch && !isSafeValue(staticMatch[1])
        if (unsafeEnv || unsafeStatic) {
            findings.push({
                path,
                line: lineNo,
                rule: 'secret-assignment',
                message: 'Sensitive config assignments must use placeholders in committed files.',
                sample: redactLine(line),
            })
        }
        if (URL_WITH_PASSWORD.test(line)) {
            findings.push({
                path,
                line: lineNo,
                rule: 'credentialed-url',
                message: 'Credentialed service URLs must stay in private env files.',
                sample: redactLine(line),
            })
        }
        if (PRIVATE_KEY_HEADER.test(line)) {
            findings.push({
                path,
                line: lineNo,
                rule: 'private-key',
                message: 'Private keys must never be committed.',
                sample: '[REDACTED PRIVATE KEY HEADER]',
            })
        }
    }
    return findings
}

function scanFile(root: string, path: string): SecretFinding[] {
    const denied = pathFinding(path)
    if (denied) {
        return [denied]
    }
    const absolutePath = join(root, path)
    if (!existsSync(absolutePath)) {
        return []
    }
    const stat = statSync(absolutePath)
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) {
        return []
    }
    const content = readFileSync(absolutePath)
    if (!isTextContent(content)) {
        return []
    }
    return scanSecretContent(path, content.toString('utf8'))
}

function checkGitignore(root: string): SecretFinding[] {
    const path = '.gitignore'
    const gitignorePath = join(root, path)
    if (!existsSync(gitignorePath)) {
        return [{ path, line: 0, rule: 'missing-gitignore', message: '.gitignore is required.', sample: path }]
    }
    const content = readFileSync(gitignorePath, 'utf8')
    return REQUIRED_GITIGNORE_PATTERNS.filter((pattern) => !content.includes(pattern)).map((pattern) => ({
        path,
        line: 0,
        rule: 'missing-ignore-pattern',
        message: 'Critical secret/build output ignore pattern is missing.',
        sample: pattern,
    }))
}

export function collectSecretFindings(root: string = process.cwd()): SecretFinding[] {
    const findings = checkGitignore(root)
    for (const path of listCandidateFiles(root)) {
        findings.push(...scanFile(root, path))
    }
    return findings
}

function main(): void {
    const findings = collectSecretFindings()
    if (findings.length === 0) {
        console.log('[harness] secrets gate passed')
        return
    }
    console.error('[harness] secrets gate failed')
    for (const finding of findings) {
        const location = finding.line > 0 ? `${finding.path}:${finding.line}` : finding.path
        console.error(`- ${location} [${finding.rule}] ${finding.message} ${finding.sample}`)
    }
    process.exit(1)
}

if (import.meta.main) {
    main()
}
