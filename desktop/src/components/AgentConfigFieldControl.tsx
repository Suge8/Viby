import {
    type AgentConfigFieldDefinition,
    type AgentConfigFieldValue,
    type AgentConfigLanguage,
    localizeAgentConfigText,
} from '@viby/protocol'
import { AnimatePresence, m } from 'motion/react'
import { type JSX, type RefObject, useEffect, useId, useRef, useState } from 'react'
import type { DesktopCopy } from '@/lib/desktopCopy'
import { CheckIcon, ChevronIcon } from './icons'

type FieldControlProps = {
    copy: DesktopCopy
    disabled: boolean
    field: AgentConfigFieldDefinition
    language: AgentConfigLanguage
    value: AgentConfigFieldValue
    onChange(value: AgentConfigFieldValue): void
}

function stringValue(value: AgentConfigFieldValue): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function listValue(value: AgentConfigFieldValue): string {
    return Array.isArray(value) ? value.join('\n') : ''
}

function parseListValue(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
}

function useOutsideDismiss(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void): void {
    useEffect(() => {
        if (!open) return

        function handlePointerDown(event: PointerEvent): void {
            if (!ref.current?.contains(event.target as Node)) onClose()
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') onClose()
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [onClose, open, ref])
}

function SelectOption(props: {
    label: string
    selected: boolean
    value: string
    onSelect(value: string): void
}): JSX.Element {
    return (
        <button
            type="button"
            role="option"
            aria-selected={props.selected}
            className={props.selected ? 'is-selected' : ''}
            onClick={() => props.onSelect(props.value)}
        >
            <span>{props.label}</span>
            {props.selected ? <CheckIcon /> : null}
        </button>
    )
}

function AgentConfigSelect(props: FieldControlProps): JSX.Element {
    const [open, setOpen] = useState(false)
    const selectRef = useRef<HTMLDivElement | null>(null)
    const listboxId = useId()
    const value = stringValue(props.value)
    const selectedOption = props.field.options?.find((option) => option.value === value)
    const selectedLabel = selectedOption
        ? localizeAgentConfigText(selectedOption.label, props.language)
        : props.copy.agentConfigSystemDefault
    useOutsideDismiss(open, selectRef, () => setOpen(false))

    useEffect(() => {
        if (props.disabled) setOpen(false)
    }, [props.disabled])

    const select = (nextValue: string): void => {
        props.onChange(nextValue)
        setOpen(false)
    }

    return (
        <div ref={selectRef} className="desktop-agent-config-select">
            <button
                type="button"
                className="desktop-agent-config-select-trigger"
                disabled={props.disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                onClick={() => setOpen((current) => !current)}
            >
                <span>{selectedLabel}</span>
                <ChevronIcon aria-hidden="true" />
            </button>
            <AnimatePresence initial={false}>
                {open ? (
                    <m.div
                        id={listboxId}
                        role="listbox"
                        className="desktop-agent-config-select-popover"
                        initial={{ opacity: 0, scale: 0.98, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -4 }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <SelectOption
                            label={props.copy.agentConfigSystemDefault}
                            selected={value === ''}
                            value=""
                            onSelect={select}
                        />
                        {(props.field.options ?? []).map((option) => (
                            <SelectOption
                                key={option.value}
                                label={localizeAgentConfigText(option.label, props.language)}
                                selected={option.value === value}
                                value={option.value}
                                onSelect={select}
                            />
                        ))}
                    </m.div>
                ) : null}
            </AnimatePresence>
        </div>
    )
}

export function AgentConfigFieldControl(props: FieldControlProps): JSX.Element {
    if (props.field.control === 'toggle') {
        return (
            <label className="desktop-agent-config-switch">
                <input
                    type="checkbox"
                    checked={props.value === true}
                    disabled={props.disabled}
                    onChange={(event) => props.onChange(event.currentTarget.checked)}
                />
                <span />
            </label>
        )
    }

    if (props.field.control === 'select') return <AgentConfigSelect {...props} />

    if (props.field.control === 'list') {
        return (
            <textarea
                className="desktop-agent-config-field-control is-textarea"
                value={listValue(props.value)}
                disabled={props.disabled}
                onChange={(event) => props.onChange(parseListValue(event.currentTarget.value))}
            />
        )
    }

    return (
        <input
            className="desktop-agent-config-field-control"
            type={props.field.control === 'number' ? 'number' : 'text'}
            value={stringValue(props.value)}
            disabled={props.disabled}
            onChange={(event) => {
                const value = event.currentTarget.value
                props.onChange(props.field.control === 'number' ? Number(value) : value)
            }}
        />
    )
}
