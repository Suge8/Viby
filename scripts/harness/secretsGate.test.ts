import { describe, expect, it } from 'bun:test'
import { scanSecretContent } from './secretsGate'

function source(lines: string[]): string {
    return lines.join('\n')
}

describe('secretsGate', () => {
    it('allows committed examples and placeholder values', () => {
        const content = source([
            'PAIRING_CREATE_' + 'TOKEN=replace-with-strong-secret',
            'PAIRING_TURN_STATIC_AUTH_' + 'SECRET=your-turn-secret',
            'PAIRING_REDIS_' + 'URL=redis://127.0.0.1:6379',
            'static-auth-' + 'secret=replace-with-turn-secret',
        ])

        expect(scanSecretContent('pairing/.env.example', content)).toEqual([])
    })

    it('rejects sensitive env assignments without printing the value', () => {
        const content = 'PAIRING_CREATE_' + 'TOKEN=prod-token-value-123456'
        const findings = scanSecretContent('pairing.env', content)

        expect(findings).toHaveLength(1)
        expect(findings[0]).toMatchObject({ rule: 'secret-assignment' })
        expect(findings[0].sample).toContain('[REDACTED]')
        expect(findings[0].sample).not.toContain('prod-token-value')
    })

    it('rejects credentialed service urls', () => {
        const content = source([
            'PAIRING_REDIS_' + 'URL=redis://' + ':prod-pass@127.0.0.1:6379',
            'connect red' + 'is://:another-pass@127.0.0.1:6379',
        ])
        const findings = scanSecretContent('config.txt', content)

        expect(findings.some((finding) => finding.rule === 'credentialed-url')).toBe(true)
        expect(findings.every((finding) => !finding.sample.includes('prod-pass'))).toBe(true)
        expect(findings.every((finding) => !finding.sample.includes('another-pass'))).toBe(true)
    })

    it('rejects private key material', () => {
        const content = '-----BEGIN ' + 'PRIVATE KEY-----'

        expect(scanSecretContent('key.txt', content)).toEqual([
            {
                path: 'key.txt',
                line: 1,
                rule: 'private-key',
                message: 'Private keys must never be committed.',
                sample: '[REDACTED PRIVATE KEY HEADER]',
            },
        ])
    })
})
