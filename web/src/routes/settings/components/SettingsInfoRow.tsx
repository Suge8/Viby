type SettingsInfoRowProps = {
    label: string
    value: string
}

export function SettingsInfoRow(props: SettingsInfoRowProps): React.JSX.Element {
    return (
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
            <span className="text-sm font-medium text-[var(--ds-text-secondary)]">
                {props.label}
            </span>
            <span className="text-sm font-semibold tracking-[-0.02em] text-[var(--ds-text-primary)]">
                {props.value}
            </span>
        </div>
    )
}
