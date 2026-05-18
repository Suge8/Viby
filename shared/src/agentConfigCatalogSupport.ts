import type { AgentConfigFieldDefinition } from './agentConfig'

type Text = AgentConfigFieldDefinition['label']
type FieldInput = Omit<AgentConfigFieldDefinition, 'label' | 'help' | 'options'> & {
    label: [string, string]
    help: [string, string]
    options?: Array<[string, string, string]>
}

const text = (en: string, zh: string): Text => ({ en, zh })

const fieldOptions = (items: Array<[string, string, string]>) =>
    items.map(([value, en, zh]) => ({ value, label: text(en, zh) }))

export function field(input: FieldInput): AgentConfigFieldDefinition {
    const { label, help, options, ...definition } = input
    const resolved = { ...definition, label: text(...label), help: text(...help) }
    return options ? { ...resolved, options: fieldOptions(options) } : resolved
}

export const approvalOptions = [
    ['untrusted', 'Ask for writes and commands', '写文件和命令都询问'],
    ['on-request', 'Agent asks when needed', '由 Agent 按需请求'],
    ['never', 'Never ask', '从不询问'],
] satisfies Array<[string, string, string]>

export const reasoningOptions = [
    ['none', 'None', '关闭'],
    ['minimal', 'Minimal', '极低'],
    ['low', 'Low', '低'],
    ['medium', 'Medium', '中'],
    ['high', 'High', '高'],
    ['xhigh', 'Extra high', '超高'],
] satisfies Array<[string, string, string]>
