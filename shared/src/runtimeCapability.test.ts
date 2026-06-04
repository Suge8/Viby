import { describe, expect, it } from 'bun:test'
import { RuntimeCapabilityRequestSchema, RuntimeCapabilityResponseSchema } from './runtimeCapability'

describe('runtimeCapability contract', () => {
    it('normalizes query drivers and defaults to availability depth', () => {
        expect(RuntimeCapabilityRequestSchema.parse({ drivers: 'codex,claude,codex' })).toEqual({
            drivers: ['claude', 'codex'],
            depth: 'availability',
        })
    })

    it('keeps raw provider reason out of launch config snapshot errors', () => {
        const parsed = RuntimeCapabilityResponseSchema.parse({
            snapshot: {
                machineId: 'machine-1',
                directory: '/repo',
                detectedAt: null,
                expiresAt: null,
                refreshing: false,
                error: null,
                agents: [
                    {
                        driver: 'pi',
                        availability: {
                            driver: 'pi',
                            value: null,
                            detectedAt: null,
                            expiresAt: null,
                            refreshing: false,
                            error: null,
                        },
                        launchConfig: {
                            agent: 'pi',
                            config: null,
                            detectedAt: 1,
                            expiresAt: 2,
                            refreshing: false,
                            error: { code: 'auth_missing', detectedAt: 1 },
                        },
                    },
                ],
            },
        })

        expect(parsed.snapshot.agents[0]?.launchConfig.error).toEqual({ code: 'auth_missing', detectedAt: 1 })
        expect(JSON.stringify(parsed)).not.toContain('Pi auth missing')
    })
})
