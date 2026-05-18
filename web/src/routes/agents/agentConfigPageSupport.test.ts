import type { AgentConfigResponse } from '@viby/protocol'
import { describe, expect, it } from 'vitest'
import {
    areFieldValuesEqual,
    CONFIG_DRIVERS,
    createAgentConfigDraft,
    createAgentConfigPatch,
    getAgentConfigState,
    groupFields,
    groupLabel,
    hasAgentConfigChanges,
    localizeText,
    updateDraftValue,
} from './agentConfigPageSupport'

const version = {
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
                values: {
                    'codex.model': 'gpt-5.4',
                    'codex.sandbox_workspace_write.network_access': true,
                },
                version,
            },
            {
                driver: 'claude',
                path: '/home/user/.claude/settings.json',
                exists: false,
                values: {
                    'claude.model': 'sonnet',
                },
                version,
            },
        ],
    }
}

describe('agentConfigPageSupport', () => {
    it('creates a complete draft for every configurable driver', () => {
        const draft = createAgentConfigDraft(response())

        expect(Object.keys(draft)).toEqual([...CONFIG_DRIVERS])
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

        expect(groupFields(fields)).toEqual([
            { group: 'model', fields: [fields[0], fields[1]] },
            { group: 'safety', fields: [fields[2]] },
            { group: 'runtime', fields: [fields[3]] },
        ])
    })

    it('localizes known and unknown labels from the same helper', () => {
        expect(localizeText({ en: 'Model', zh: '模型' }, 'zh-CN')).toBe('模型')
        expect(localizeText({ en: 'Model', zh: '模型' }, 'en')).toBe('Model')
        expect(groupLabel('model', 'zh-CN')).toBe('模型')
        expect(groupLabel('runtime', 'en')).toBe('Runtime')
        expect(groupLabel('custom-group', 'zh-CN')).toBe('custom-group')
    })

    it('compares scalar and list field values without reference identity traps', () => {
        expect(areFieldValuesEqual('gpt-5.4', 'gpt-5.4')).toBe(true)
        expect(areFieldValuesEqual(true, false)).toBe(false)
        expect(areFieldValuesEqual(['Read(./.env)'], ['Read(./.env)'])).toBe(true)
        expect(areFieldValuesEqual(['a', 'b'], ['b', 'a'])).toBe(false)
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
        const updated = updateDraftValue(draft, 'codex', 'codex.model', 'gpt-5.5')

        expect(updated.codex['codex.model']).toBe('gpt-5.5')
        expect(draft.codex['codex.model']).toBe('gpt-5.4')
        expect(updated.claude).toBe(draft.claude)
        expect(updated.codex).not.toBe(draft.codex)
    })
})
