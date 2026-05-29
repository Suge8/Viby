import { describe, expect, it } from 'vitest'
import type { AgentConfigResponse } from './agentConfig'
import {
    AGENT_CONFIG_DRIVER_LABELS,
    AGENT_CONFIG_VIEW_DRIVERS,
    agentConfigGroupLabel,
    areAgentConfigFieldValuesEqual,
    createAgentConfigDraft,
    createAgentConfigPatch,
    formatAgentConfigBackupTime,
    getAgentConfigAdvisory,
    getAgentConfigState,
    groupAgentConfigFields,
    hasAgentConfigChanges,
    localizeAgentConfigText,
    toAgentConfigLanguage,
    updateAgentConfigDraftValue,
} from './agentConfigViewSupport'

const supportedVersion = {
    status: 'supported' as const,
    supportedVersion: '0.130.0',
    source: 'test',
    installedVersion: '0.130.0',
    checkedAt: 1,
}

function response(): AgentConfigResponse {
    return {
        agents: [
            {
                driver: 'codex',
                path: '/home/user/.codex/config.toml',
                exists: true,
                values: { 'codex.model': 'gpt-5.4', 'codex.sandbox_workspace_write.network_access': true },
                version: supportedVersion,
            },
            {
                driver: 'claude',
                path: '/home/user/.claude/settings.json',
                exists: false,
                values: { 'claude.model': 'sonnet' },
                version: supportedVersion,
            },
        ],
    }
}

describe('agentConfigViewSupport', () => {
    it('creates a complete draft for every configurable driver', () => {
        const draft = createAgentConfigDraft(response())
        expect(Object.keys(draft)).toEqual([...AGENT_CONFIG_VIEW_DRIVERS])
        expect(draft.codex['codex.model']).toBe('gpt-5.4')
        expect(draft.codex['codex.sandbox_workspace_write.network_access']).toBe(true)
        expect(draft.claude['claude.model']).toBe('sonnet')
        expect(draft.gemini['gemini.model.name']).not.toBeUndefined()
        expect(draft.pi['pi.defaultModel']).not.toBeUndefined()
        expect(draft.copilot['copilot.model']).not.toBeUndefined()
    })

    it('reads a saved state by driver without inventing one', () => {
        expect(getAgentConfigState(response(), 'codex')?.exists).toBe(true)
        expect(getAgentConfigState(response(), 'claude')?.path).toContain('.claude')
        expect(getAgentConfigState({ agents: [] }, 'gemini')).toBeNull()
        expect(getAgentConfigState(null, 'pi')).toBeNull()
        expect(getAgentConfigState(undefined, 'copilot')).toBeNull()
    })

    it('keeps grouping order stable for dense editor rendering', () => {
        const fields = [
            { id: 'a', group: 'model' },
            { id: 'b', group: 'model' },
            { id: 'c', group: 'safety' },
            { id: 'd', group: 'runtime' },
        ].map((field) => ({
            ...field,
            driver: 'codex' as const,
            path: field.id,
            control: 'text' as const,
            label: { en: field.id, zh: field.id },
            help: { en: field.id, zh: field.id },
        }))

        expect(groupAgentConfigFields(fields)).toEqual([
            { group: 'model', fields: [fields[0], fields[1]] },
            { group: 'safety', fields: [fields[2]] },
            { group: 'runtime', fields: [fields[3]] },
        ])
    })

    it('localizes known and unknown labels from the same helper', () => {
        expect(localizeAgentConfigText({ en: 'Model', zh: '模型' }, 'zh')).toBe('模型')
        expect(localizeAgentConfigText({ en: 'Model', zh: '模型' }, 'en')).toBe('Model')
        expect(agentConfigGroupLabel('model', 'zh')).toBe('模型')
        expect(agentConfigGroupLabel('runtime', 'en')).toBe('Runtime')
        expect(agentConfigGroupLabel('custom-group', 'zh')).toBe('custom-group')
    })

    it('maps web locales to canonical agent-config language', () => {
        expect(toAgentConfigLanguage('zh-CN')).toBe('zh')
        expect(toAgentConfigLanguage('zh')).toBe('zh')
        expect(toAgentConfigLanguage('en')).toBe('en')
        expect(toAgentConfigLanguage('en-US')).toBe('en')
    })

    it('compares scalar and list field values without reference identity traps', () => {
        expect(areAgentConfigFieldValuesEqual('gpt-5.4', 'gpt-5.4')).toBe(true)
        expect(areAgentConfigFieldValuesEqual(true, false)).toBe(false)
        expect(areAgentConfigFieldValuesEqual(['Read(./.env)'], ['Read(./.env)'])).toBe(true)
        expect(areAgentConfigFieldValuesEqual(['a', 'b'], ['b', 'a'])).toBe(false)
    })

    it('detects changes against saved values and field defaults', () => {
        const draft = createAgentConfigDraft(response())
        const fields = [
            {
                id: 'codex.model',
                driver: 'codex' as const,
                group: 'model',
                path: 'model',
                control: 'text' as const,
                label: { en: 'Model', zh: '模型' },
                help: { en: 'Model', zh: '模型' },
                defaultValue: 'gpt-5.4',
            },
        ]

        expect(hasAgentConfigChanges(fields, draft.codex, response().agents[0]?.values)).toBe(false)
        expect(
            hasAgentConfigChanges(fields, { ...draft.codex, 'codex.model': 'gpt-5.5' }, response().agents[0]?.values)
        ).toBe(true)
        expect(hasAgentConfigChanges(fields, { 'codex.model': 'gpt-5.4' }, undefined)).toBe(false)
        expect(
            createAgentConfigPatch(fields, { ...draft.codex, 'codex.model': 'gpt-5.5' }, response().agents[0]?.values)
        ).toEqual({ 'codex.model': 'gpt-5.5' })
    })

    it('updates one driver draft immutably', () => {
        const draft = createAgentConfigDraft(response())
        const updated = updateAgentConfigDraftValue(draft, 'codex', 'codex.model', 'gpt-5.5')
        expect(updated.codex['codex.model']).toBe('gpt-5.5')
        expect(draft.codex['codex.model']).toBe('gpt-5.4')
        expect(updated.claude).toBe(draft.claude)
        expect(updated.codex).not.toBe(draft.codex)
    })

    it('classifies version advisory state without spilling i18n into the model', () => {
        expect(getAgentConfigAdvisory(null)).toBeNull()
        const supportedState = response().agents[0]!
        expect(getAgentConfigAdvisory(supportedState)).toBeNull()

        const outdated = getAgentConfigAdvisory({
            ...supportedState,
            version: { ...supportedVersion, status: 'outdated', installedVersion: '0.1.0' },
        })
        expect(outdated).toEqual({ kind: 'outdated', installed: '0.1.0', supportedVersion: '0.130.0' })

        const missing = getAgentConfigAdvisory({
            ...supportedState,
            version: { ...supportedVersion, status: 'missing', installedVersion: undefined },
        })
        expect(missing).toEqual({ kind: 'missing', installed: null, supportedVersion: '0.130.0' })
    })

    it('formats backup timestamps in the requested language', () => {
        const timestamp = Date.UTC(2026, 4, 21, 6, 0)
        expect(formatAgentConfigBackupTime(timestamp, 'zh')).toMatch(/\d/)
        expect(formatAgentConfigBackupTime(timestamp, 'en')).toMatch(/\d/)
    })

    it('exposes every driver label in display order', () => {
        for (const driver of AGENT_CONFIG_VIEW_DRIVERS) {
            expect(AGENT_CONFIG_DRIVER_LABELS[driver]).toBeTruthy()
        }
    })
})
