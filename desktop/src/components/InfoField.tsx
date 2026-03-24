interface InfoFieldProps {
    label: string
    value?: string
    actionLabel?: string
    onAction?: () => void
    mono?: boolean
}

export function InfoField({
    label,
    value,
    actionLabel,
    onAction,
    mono = false
}: InfoFieldProps) {
    return (
        <div className="bg-slate-800/50 border border-slate-700/80 rounded-lg p-4 transition-colors hover:border-slate-600 hover:bg-slate-800">
            <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-medium">{label}</span>
                {actionLabel && onAction ? (
                    <button className="text-sm font-medium text-sky-500 hover:text-sky-400 transition-colors" onClick={onAction} type="button">
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <div className={`mt-2 text-lg text-white font-semibold ${mono ? 'font-mono' : ''}`}>
                {value || <span className="text-slate-500">暂无</span>}
            </div>
        </div>
    )
}
