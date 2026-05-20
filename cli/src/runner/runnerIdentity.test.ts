import { describe, expect, it } from 'vitest'
import { hashRunnerHubOwnerToken, isRunnerStateCompatibleWithIdentity } from './runnerIdentity'

describe('runnerIdentity', () => {
    it('matches when api url, machine id, token hash all same', () => {
        const tokenHash = hashRunnerHubOwnerToken('secret-token')

        expect(
            isRunnerStateCompatibleWithIdentity(
                {
                    startedWithApiUrl: 'http://example.com',
                    startedWithMachineId: 'machine-123',
                    startedWithHubOwnerTokenHash: tokenHash,
                },
                {
                    apiUrl: 'http://example.com',
                    machineId: 'machine-123',
                    hubOwnerTokenHash: tokenHash,
                }
            )
        ).toBe(true)
    })

    it('rejects reused runner when api url changed', () => {
        expect(
            isRunnerStateCompatibleWithIdentity(
                {
                    startedWithApiUrl: 'http://old-hub',
                    startedWithMachineId: 'machine-123',
                    startedWithHubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                },
                {
                    apiUrl: 'http://new-hub',
                    machineId: 'machine-123',
                    hubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                }
            )
        ).toBe(false)
    })

    it('rejects reused runner when token changed', () => {
        expect(
            isRunnerStateCompatibleWithIdentity(
                {
                    startedWithApiUrl: 'http://example.com',
                    startedWithMachineId: 'machine-123',
                    startedWithHubOwnerTokenHash: hashRunnerHubOwnerToken('old-token'),
                },
                {
                    apiUrl: 'http://example.com',
                    machineId: 'machine-123',
                    hubOwnerTokenHash: hashRunnerHubOwnerToken('new-token'),
                }
            )
        ).toBe(false)
    })

    it('rejects reused runner when current machine id is missing', () => {
        expect(
            isRunnerStateCompatibleWithIdentity(
                {
                    startedWithApiUrl: 'http://example.com',
                    startedWithMachineId: 'machine-123',
                    startedWithHubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                },
                {
                    apiUrl: 'http://example.com',
                    hubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                }
            )
        ).toBe(false)
    })

    it('rejects reused runner when current token hash is missing', () => {
        expect(
            isRunnerStateCompatibleWithIdentity(
                {
                    startedWithApiUrl: 'http://example.com',
                    startedWithMachineId: 'machine-123',
                    startedWithHubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                },
                {
                    apiUrl: 'http://example.com',
                    machineId: 'machine-123',
                }
            )
        ).toBe(false)
    })

    it('rejects old runner state missing connection identity', () => {
        expect(
            isRunnerStateCompatibleWithIdentity(
                {},
                {
                    apiUrl: 'http://example.com',
                    machineId: 'machine-123',
                    hubOwnerTokenHash: hashRunnerHubOwnerToken('secret-token'),
                }
            )
        ).toBe(false)
    })
})
