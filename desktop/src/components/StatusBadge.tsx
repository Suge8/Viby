import { memo } from 'react'
import type { HubRuntimePhase } from '@/types'
import { formatPhaseLabel } from '@/lib/format'

interface StatusBadgeProps {
    phase?: HubRuntimePhase
    running: boolean
}

export const StatusBadge = memo(function StatusBadge({
    phase,
    running
}: StatusBadgeProps) {
    const phaseClassName = phase ? `status-badge status-${phase}` : 'status-badge status-idle'

    return (
        <div className={phaseClassName}>
            <span className="status-dot" />
            <span>{formatPhaseLabel(phase, running)}</span>
        </div>
    )
})
