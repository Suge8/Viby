import { describe, expect, it } from 'bun:test'
import { basename } from 'node:path'
import { resolveBrowserSmokeProfileDir } from './browserSmokeRuntime'
import {
    type BrowserControllerTraceEvent,
    type CdpClient,
    collectBrowserFailures,
    formatBrowserSmokeSummary,
} from './browserSmokeSupport'

describe('browser smoke runtime', () => {
    it('creates a managed temp profile when none is provided', () => {
        const result = resolveBrowserSmokeProfileDir()

        expect(result.managed).toBe(true)
        expect(basename(result.profileDir).startsWith('viby-browser-profile.')).toBe(true)
    })

    it('preserves explicit browser profile ownership', () => {
        const result = resolveBrowserSmokeProfileDir('/tmp/viby-explicit-browser-profile')

        expect(result).toEqual({
            profileDir: '/tmp/viby-explicit-browser-profile',
            managed: false,
        })
    })

    it('filters browser failures down to real smoke blockers', () => {
        const client = {
            drainEvents: () => [
                { method: 'Runtime.consoleAPICalled', params: { type: 'error', args: ['boom'] }, sessionId: 'page' },
                { method: 'Runtime.consoleAPICalled', params: { type: 'log', args: ['ok'] }, sessionId: 'page' },
                {
                    method: 'Runtime.exceptionThrown',
                    params: { exceptionDetails: { text: 'explode' } },
                    sessionId: 'page',
                },
                { method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'bad log' } }, sessionId: 'page' },
                { method: 'Network.loadingFailed', params: { errorText: 'ERR_ABORTED' }, sessionId: 'page' },
                { method: 'Network.loadingFailed', params: { errorText: 'ECONNRESET' }, sessionId: 'page' },
                {
                    method: 'Runtime.consoleAPICalled',
                    params: { type: 'error', args: ['other tab'] },
                    sessionId: 'other',
                },
            ],
        } as unknown as CdpClient

        expect(collectBrowserFailures({ client, sessionId: 'page' })).toEqual({
            consoleErrors: [{ type: 'error', args: ['boom'] }],
            runtimeExceptions: [{ text: 'explode' }],
            logErrors: [{ level: 'error', text: 'bad log' }],
            networkFailures: [{ errorText: 'ECONNRESET' }],
        })
    })

    it('renders summary lines with controller conflicts and screenshot metadata', () => {
        const controllerTrace: BrowserControllerTraceEvent[] = [
            { type: 'enter', surface: 'chat' },
            { type: 'conflict', surface: 'chat' },
        ]
        const summary = formatBrowserSmokeSummary({
            targetUrl: 'http://127.0.0.1:5173',
            finalUrl: 'http://127.0.0.1:5173/sessions',
            title: 'Viby',
            outputDir: '/tmp/artifacts',
            consoleErrors: [],
            runtimeExceptions: [],
            logErrors: [],
            networkFailures: [],
            controllerTrace,
            extraSummaryLines: ['- Screenshot owner: playwright', '- Screenshot mode: viewport'],
        })

        expect(summary).toContain('- Controller conflicts: 1')
        expect(summary).toContain('- Screenshot owner: playwright')
        expect(summary).toContain('- Screenshot mode: viewport')
    })
})
