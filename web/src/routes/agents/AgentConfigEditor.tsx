import type { AgentConfigFieldDefinition, AgentConfigFieldValue, AgentConfigFileState } from '@viby/protocol'
import { InfoIcon } from '@/components/icons'
import { SurfaceGroupCard } from '@/components/SurfaceGroupCard'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Locale } from '@/lib/use-translation'
import { cn } from '@/lib/utils'
import { groupFields, groupLabel, localizeText } from './agentConfigPageSupport'

type AgentConfigEditorProps = {
    fields: readonly AgentConfigFieldDefinition[]
    values: Record<string, AgentConfigFieldValue>
    savedState: AgentConfigFileState | null
    locale: Locale
    defaultOptionLabel: string
    disabled?: boolean
    onChange: (fieldId: string, value: AgentConfigFieldValue) => void
}

type AgentConfigFieldRowProps = AgentConfigEditorProps & {
    field: AgentConfigFieldDefinition
}

function stringValue(value: AgentConfigFieldValue | undefined): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function listValue(value: AgentConfigFieldValue | undefined): string {
    return Array.isArray(value) ? value.join('\n') : ''
}

function parseListInput(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
}

function AgentConfigControl(props: AgentConfigFieldRowProps): React.JSX.Element {
    const value = props.values[props.field.id] ?? props.field.defaultValue ?? null

    if (props.field.control === 'toggle') {
        return (
            <Switch
                checked={value === true}
                disabled={props.disabled}
                onChange={(event) => props.onChange(props.field.id, event.currentTarget.checked)}
                aria-label={localizeText(props.field.label, props.locale)}
            />
        )
    }

    if (props.field.control === 'select') {
        return (
            <Select
                value={stringValue(value)}
                disabled={props.disabled}
                onChange={(event) => props.onChange(props.field.id, event.currentTarget.value)}
                aria-label={localizeText(props.field.label, props.locale)}
            >
                <option value="">{props.defaultOptionLabel}</option>
                {(props.field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                        {localizeText(option.label, props.locale)}
                    </option>
                ))}
            </Select>
        )
    }

    if (props.field.control === 'list') {
        return (
            <Textarea
                value={listValue(value)}
                disabled={props.disabled}
                rows={4}
                onChange={(event) => props.onChange(props.field.id, parseListInput(event.currentTarget.value))}
                aria-label={localizeText(props.field.label, props.locale)}
            />
        )
    }

    return (
        <Input
            type={props.field.control === 'number' ? 'number' : 'text'}
            value={stringValue(value)}
            disabled={props.disabled}
            onChange={(event) => {
                const nextValue = event.currentTarget.value
                props.onChange(props.field.id, props.field.control === 'number' ? Number(nextValue) : nextValue)
            }}
            aria-label={localizeText(props.field.label, props.locale)}
        />
    )
}

function AgentConfigFieldRow(props: AgentConfigFieldRowProps): React.JSX.Element {
    const savedValue = props.savedState?.values[props.field.id] ?? props.field.defaultValue ?? null
    const currentValue = props.values[props.field.id] ?? null
    const changed = JSON.stringify(savedValue) !== JSON.stringify(currentValue)

    return (
        <div
            className={cn(
                'grid gap-3 border-t border-[var(--ds-border-subtle)] px-4 py-4 sm:grid-cols-2 sm:items-center sm:px-5',
                changed && 'bg-[color-mix(in_srgb,var(--ds-brand-soft)_38%,transparent)]'
            )}
        >
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
                        {localizeText(props.field.label, props.locale)}
                    </p>
                    <span title={localizeText(props.field.help, props.locale)}>
                        <InfoIcon className="h-4 w-4 text-[var(--ds-text-muted)]" aria-hidden="true" />
                    </span>
                </div>
                <p className="mt-1 text-sm leading-5 text-[var(--ds-text-secondary)]">
                    {localizeText(props.field.help, props.locale)}
                </p>
                <p className="mt-2 truncate font-mono text-xs text-[var(--ds-text-muted)]">{props.field.path}</p>
            </div>

            <div className="min-w-0 sm:justify-self-end sm:w-full">
                <AgentConfigControl {...props} />
            </div>
        </div>
    )
}

export function AgentConfigEditor(props: AgentConfigEditorProps): React.JSX.Element {
    return (
        <div className="grid gap-3">
            {groupFields(props.fields).map((group) => (
                <SurfaceGroupCard key={group.group} title={groupLabel(group.group, props.locale)}>
                    {group.fields.map((field) => (
                        <AgentConfigFieldRow key={field.id} {...props} field={field} />
                    ))}
                </SurfaceGroupCard>
            ))}
        </div>
    )
}
