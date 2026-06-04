import { describe, expect, it } from 'vitest'
import { isAllowedBashCommand, parseBashPermission } from './allowedToolSupport'

describe('allowedToolSupport', () => {
    it('stores exact Bash permissions as literal command approvals', () => {
        const allowedBashLiterals = new Set<string>()
        const allowedBashPrefixes = new Set<string>()

        parseBashPermission({
            permission: 'Bash(pwd)',
            allowedBashLiterals,
            allowedBashPrefixes,
        })

        expect(allowedBashLiterals).toEqual(new Set(['pwd']))
        expect(allowedBashPrefixes.size).toBe(0)
        expect(
            isAllowedBashCommand({
                input: { command: 'pwd' },
                allowedBashLiterals,
                allowedBashPrefixes,
            })
        ).toBe(true)
    })

    it('stores prefix Bash permissions and matches nested commands', () => {
        const allowedBashLiterals = new Set<string>()
        const allowedBashPrefixes = new Set<string>()

        parseBashPermission({
            permission: 'Bash(git status:*)',
            allowedBashLiterals,
            allowedBashPrefixes,
        })

        expect(allowedBashLiterals.size).toBe(0)
        expect(allowedBashPrefixes).toEqual(new Set(['git status']))
        expect(
            isAllowedBashCommand({
                input: { command: 'git status --short' },
                allowedBashLiterals,
                allowedBashPrefixes,
            })
        ).toBe(true)
    })

    it('ignores malformed permissions and rejects missing command payloads', () => {
        const allowedBashLiterals = new Set<string>()
        const allowedBashPrefixes = new Set<string>()

        parseBashPermission({
            permission: 'Read(file.txt)',
            allowedBashLiterals,
            allowedBashPrefixes,
        })

        expect(allowedBashLiterals.size).toBe(0)
        expect(allowedBashPrefixes.size).toBe(0)
        expect(
            isAllowedBashCommand({
                input: { filePath: 'README.md' },
                allowedBashLiterals,
                allowedBashPrefixes,
            })
        ).toBe(false)
    })

    it('does not treat literal permissions as prefix approvals', () => {
        const allowedBashLiterals = new Set<string>()
        const allowedBashPrefixes = new Set<string>()

        parseBashPermission({
            permission: 'Bash(pwd)',
            allowedBashLiterals,
            allowedBashPrefixes,
        })

        expect(
            isAllowedBashCommand({
                input: { command: 'pwd -P' },
                allowedBashLiterals,
                allowedBashPrefixes,
            })
        ).toBe(false)
    })

    it('leaves the helper-owned sets unchanged for bare Bash approvals', () => {
        const allowedBashLiterals = new Set<string>(['pwd'])
        const allowedBashPrefixes = new Set<string>(['git status'])

        parseBashPermission({
            permission: 'Bash',
            allowedBashLiterals,
            allowedBashPrefixes,
        })

        expect(allowedBashLiterals).toEqual(new Set(['pwd']))
        expect(allowedBashPrefixes).toEqual(new Set(['git status']))
    })
})
