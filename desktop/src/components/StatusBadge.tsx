import type { HubRuntimePhase } from '@/types'
import { formatPhaseLabel } from '@/lib/format'

interface StatusBadgeProps {
    phase?: HubRuntimePhase
    running: boolean
}

const getPhaseStyles = (phase: HubRuntimePhase | undefined, running: boolean): [string, string] => {
    if (running || phase === 'ready') {
        return ['bg-green-500', 'text-green-300']
    }
    switch (phase) {
        case 'starting':
            return ['bg-yellow-500', 'text-yellow-300']
        case 'error':
            return ['bg-red-500', 'text-red-300']
        case 'stopped':
        default:
            return ['bg-slate-600', 'text-slate-400']
    }
}

export function StatusBadge({
    phase,
    running
}: StatusBadgeProps) {
    const [dotClass, textClass] = getPhaseStyles(phase, running)
    const pulseClass = phase === 'starting' ? 'animate-pulse' : ''

    return (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/80">
            <span className={`w-2 h-2 rounded-full ${dotClass} ${pulseClass}`} />
            <span className={`text-sm font-medium ${textClass}`}>{formatPhaseLabel(phase, running)}</span>
        </div>
    )
}
