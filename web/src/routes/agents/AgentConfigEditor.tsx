import {
    type AgentConfigFieldDefinition,
    type AgentConfigFieldValue,
    type AgentConfigFileState,
    type AgentConfigLanguage,
    agentConfigGroupLabel,
    groupAgentConfigFields,
    localizeAgentConfigText,
} from '@viby/protocol'
import { useId, useState } from 'react'
import { FeatureCheckIcon } from '@/components/featureIcons'
import { ChevronIcon } from '@/components/icons'
import { SurfaceGroupCard } from '@/components/SurfaceGroupCard'
import { Button } from '@/components/ui/button'
import { CollapsiblePanel } from '@/components/ui/CollapsiblePanel'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type AgentConfigEditorProps = {
    fields: readonly AgentConfigFieldDefinition[]
    values: Record<string, AgentConfigFieldValue>
    savedState: AgentConfigFileState | null
    language: AgentConfigLanguage
    defaultOptionLabel: string
    changedLabel: string
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

function AgentConfigSelect(props: AgentConfigFieldRowProps & { value: string }): React.JSX.Element {
    const [open, setOpen] = useState(false)
    const listboxId = useId()
    const selectedOption = props.field.options?.find((option) => option.value === props.value)
    const selectedLabel = selectedOption
        ? localizeAgentConfigText(selectedOption.label, props.language)
        : props.defaultOptionLabel

    const expanded = open && !props.disabled

    function select(value: string): void {
        props.onChange(props.field.id, value)
        setOpen(false)
    }

    const options = [
        { value: '', label: props.defaultOptionLabel },
        ...((props.field.options ?? []).map((option) => ({
            value: option.value,
            label: localizeAgentConfigText(option.label, props.language),
        })) as Array<{ value: string; label: string }>),
    ]

    return (
        <div className="w-full min-w-0">
            <Button
                type="button"
                variant="ghost"
                pressStyle="list-row"
                disabled={props.disabled}
                aria-haspopup="listbox"
                aria-expanded={expanded}
                aria-controls={listboxId}
                className="min-h-[var(--ds-touch-target)] w-full justify-between rounded-[var(--ds-field-radius)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_96%,transparent)] px-4 py-3 text-left shadow-none transition-colors duration-150 hover:border-[var(--ds-border-strong)] hover:bg-[var(--app-subtle-bg)] [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between"
                onClick={() => setOpen((current) => !current)}
            >
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--ds-text-primary)]">
                    {selectedLabel}
                </span>
                <ChevronIcon collapsed={!expanded} className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]" />
            </Button>
            <CollapsiblePanel open={expanded} className="pt-2">
                <div
                    id={listboxId}
                    role="listbox"
                    className="desktop-scrollbar-stable grid max-h-60 gap-1 overflow-y-auto rounded-[var(--ds-radius-lg)] border border-[var(--ds-border-default)] bg-[color:color-mix(in_srgb,var(--ds-panel-strong)_94%,transparent)] p-2 shadow-[var(--ds-shadow-soft)]"
                >
                    {options.map((option) => {
                        const selected = option.value === props.value
                        return (
                            <Button
                                key={option.value || 'default'}
                                type="button"
                                size="sm"
                                variant={selected ? 'secondary' : 'ghost'}
                                pressStyle="list-row"
                                role="option"
                                aria-selected={selected}
                                className={cn(
                                    'rounded-[var(--ds-radius-md)] px-3 py-2.5 text-left [&>[data-button-content]]:w-full [&>[data-button-content]]:justify-between',
                                    selected &&
                                        'border-[var(--ds-border-strong)] bg-[var(--app-subtle-bg)] shadow-[var(--ds-shadow-soft)]'
                                )}
                                onClick={() => select(option.value)}
                            >
                                <span className="truncate text-sm font-medium">{option.label}</span>
                                {selected ? (
                                    <FeatureCheckIcon className="h-4 w-4 text-[var(--ds-accent-lime)]" />
                                ) : null}
                            </Button>
                        )
                    })}
                </div>
            </CollapsiblePanel>
        </div>
    )
}

function AgentConfigControl(props: AgentConfigFieldRowProps): React.JSX.Element {
    const value = props.values[props.field.id] ?? props.field.defaultValue ?? null

    if (props.field.control === 'toggle') {
        return (
            <Switch
                checked={value === true}
                disabled={props.disabled}
                onChange={(event) => props.onChange(props.field.id, event.currentTarget.checked)}
                aria-label={localizeAgentConfigText(props.field.label, props.language)}
            />
        )
    }

    if (props.field.control === 'select') {
        return <AgentConfigSelect {...props} value={stringValue(value)} />
    }

    if (props.field.control === 'list') {
        return (
            <Textarea
                value={listValue(value)}
                disabled={props.disabled}
                rows={4}
                onChange={(event) => props.onChange(props.field.id, parseListInput(event.currentTarget.value))}
                aria-label={localizeAgentConfigText(props.field.label, props.language)}
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
            aria-label={localizeAgentConfigText(props.field.label, props.language)}
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
                'relative grid gap-3 border-t border-[var(--ds-border-subtle)] px-4 py-4 transition-colors sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-start sm:gap-6 sm:px-5',
                changed && 'bg-[color-mix(in_srgb,var(--ds-brand-soft)_55%,transparent)]'
            )}
        >
            {changed ? (
                <span
                    aria-hidden="true"
                    className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-[var(--ds-brand)]"
                />
            ) : null}
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--ds-text-primary)]">
                        {localizeAgentConfigText(props.field.label, props.language)}
                    </p>
                    {changed ? (
                        <span className="inline-flex items-center rounded-full bg-[var(--ds-brand)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-inverse)]">
                            {props.changedLabel}
                        </span>
                    ) : null}
                </div>
                <p className="mt-1 text-sm leading-5 text-[var(--ds-text-secondary)]">
                    {localizeAgentConfigText(props.field.help, props.language)}
                </p>
                <p className="mt-2 truncate font-mono text-xs text-[var(--ds-text-muted)]">{props.field.path}</p>
            </div>

            <div className="min-w-0 sm:justify-self-stretch">
                <AgentConfigControl {...props} />
            </div>
        </div>
    )
}

export function AgentConfigEditor(props: AgentConfigEditorProps): React.JSX.Element {
    return (
        <div className="grid gap-3">
            {groupAgentConfigFields(props.fields).map((group) => (
                <SurfaceGroupCard key={group.group} title={agentConfigGroupLabel(group.group, props.language)}>
                    {group.fields.map((field) => (
                        <AgentConfigFieldRow key={field.id} {...props} field={field} />
                    ))}
                </SurfaceGroupCard>
            ))}
        </div>
    )
}
