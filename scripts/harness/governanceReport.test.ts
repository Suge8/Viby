import { describe, expect, it } from 'bun:test'
import {
    collectControlHotspotCandidate,
    collectControllerOwnerViolations,
    collectGovernanceSourceMetrics,
    isSqlOwnerPath,
    isZodOwnerPath,
} from './governancePolicy'

describe('governance policy helpers', () => {
    it('counts design magic refs only for literal arbitrary utilities', () => {
        const metrics = collectGovernanceSourceMetrics(
            'web/src/components/Foo.tsx',
            '<div className="rounded-[18px] text-[11px] rounded-[var(--ds-radius-lg)] bg-[color:color-mix(in_srgb,var(--ds-brand)_12%,transparent)]" />'
        )

        expect(metrics.designMagicRefs).toBe(2)
    })

    it('recognizes zod and sql owner paths', () => {
        expect(isZodOwnerPath('shared/src/schemas.ts')).toBe(true)
        expect(isZodOwnerPath('hub/src/web/routes/sessions.ts')).toBe(true)
        expect(isZodOwnerPath('web/src/lib/foo.ts')).toBe(false)
        expect(isSqlOwnerPath('hub/src/store/messages.ts')).toBe(true)
        expect(isSqlOwnerPath('hub/src/sync/foo.ts')).toBe(false)
    })

    it('tracks legacy raw controls, console drift, and backend fire-and-forget', () => {
        const webMetrics = collectGovernanceSourceMetrics(
            'web/src/components/LegacyEditor.tsx',
            '<div><input /><textarea /><button /></div>'
        )
        const runtimeMetrics = collectGovernanceSourceMetrics(
            'hub/src/notifications/notificationHub.ts',
            'console.error("boom"); void sendReadyNotice()'
        )

        expect(
            webMetrics.rawButtonRefs + webMetrics.rawInputRefs + webMetrics.rawTextareaRefs + webMetrics.rawSelectRefs
        ).toBe(3)
        expect(runtimeMetrics.consoleRefs).toBe(1)
        expect(runtimeMetrics.fireAndForgetRefs).toBe(1)
    })

    it('does not mistake void return types for detached async work', () => {
        const runtimeMetrics = collectGovernanceSourceMetrics(
            'cli/src/api/apiSessionPublicApi.ts',
            `type PublicApi = {
                sendMessage(): void
                flush(): Promise<void>
            }`
        )

        expect(runtimeMetrics.fireAndForgetRefs).toBe(0)
    })

    it('allows controller calls inside approved owner chains and rejects drift elsewhere', () => {
        const ownerViolations = collectControllerOwnerViolations(
            'web/src/hooks/useRealtimeConnection.ts',
            'const controller = createRealtimeEventController()'
        )
        const driftViolations = collectControllerOwnerViolations(
            'web/src/components/RandomPanel.tsx',
            'const controller = createRealtimeEventController()'
        )
        const driftMetrics = collectGovernanceSourceMetrics(
            'web/src/components/RandomPanel.tsx',
            'const controller = createRealtimeEventController()'
        )

        expect(ownerViolations).toHaveLength(0)
        expect(driftViolations).toEqual([
            expect.objectContaining({
                rule: 'realtime-event-controller-owner',
                refs: 1,
            }),
        ])
        expect(driftMetrics.controllerOwnerViolationRefs).toBe(1)
    })

    it('detects unowned control-surface hotspot candidates with side effects', () => {
        const candidate = collectControlHotspotCandidate(
            'cli/src/codex/codexRemoteSupport.ts',
            `export function bootRemote() {
                const scheduler = setTimeout(() => emit('ready'), 10)
                return () => clearTimeout(scheduler)
            }`
        )
        const ownerCandidate = collectControlHotspotCandidate(
            'cli/src/agent/readyEventScheduler.ts',
            `export function createReadyEventScheduler() {
                const timer = setTimeout(() => emit('ready'), 10)
                return () => clearTimeout(timer)
            }`
        )
        const controllerRuleOwnerCandidate = collectControlHotspotCandidate(
            'web/src/components/AssistantChat/useTranscriptVirtuoso.ts',
            `export function useTranscriptVirtuoso() {
                useEffect(() => {
                    const viewport = true
                    const id = setTimeout(() => {}, 10)
                    void viewport
                    return () => clearTimeout(id)
                }, [])
            }`
        )

        expect(candidate).toEqual(
            expect.objectContaining({
                surface: 'cli/src/codex#codex-remote',
                explicitOwner: false,
            })
        )
        expect(ownerCandidate).toEqual(
            expect.objectContaining({
                explicitOwner: true,
            })
        )
        expect(controllerRuleOwnerCandidate).toEqual(
            expect.objectContaining({
                explicitOwner: true,
            })
        )
    })
})
