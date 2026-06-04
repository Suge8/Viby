import { describe, expect, it } from 'bun:test'
import {
    buildBootstrapLedger,
    buildDefaultLedgerConfig,
    hasLedgerMarkers,
    parseLedgerConfig,
    parseRemoteRepository,
    replaceLedgerSnapshot,
} from './upstreamSupport'

describe('upstream support', () => {
    it('round-trips bootstrap ledger config', () => {
        const config = buildDefaultLedgerConfig({
            repo: 'Viby',
            upstreamRemote: 'upstream',
            upstreamBranch: 'main',
            upstreamRepository: 'tiann/hapi',
        })
        const ledger = buildBootstrapLedger(config)

        expect(hasLedgerMarkers(ledger)).toBe(true)
        expect(parseLedgerConfig(ledger)).toEqual(config)
    })

    it('replaces only the generated snapshot block', () => {
        const config = buildDefaultLedgerConfig({
            repo: 'Viby',
            upstreamRemote: 'upstream',
            upstreamBranch: 'main',
            upstreamRepository: 'tiann/hapi',
        })
        const ledger = buildBootstrapLedger(config)
        const updated = replaceLedgerSnapshot(ledger, '## Generated Snapshot\n\n- status: ok')

        expect(updated).toContain('- status: ok')
        expect(updated).toContain('## Review Decisions')
        expect(updated).toContain('## Working Rules')
    })

    it('parses remote repository names from SSH and HTTPS remotes', () => {
        expect(parseRemoteRepository('git@github.com:Suge8/Viby.git')).toBe('Suge8/Viby')
        expect(parseRemoteRepository('https://github.com/tiann/hapi.git')).toBe('tiann/hapi')
    })
})
