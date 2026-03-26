import type { JSX } from 'react';
import type { HubRuntimePhase } from '@/types';

interface StatusBadgeProps {
    phase?: HubRuntimePhase;
    running: boolean;
}

const getPhaseDotClass = (phase: HubRuntimePhase | undefined, running: boolean): string => {
    if (running || phase === 'ready') {
        return 'bg-green-500';
    }
    switch (phase) {
        case 'starting':
            return 'bg-yellow-500 animate-pulse';
        case 'error':
            return 'bg-red-500';
        case 'stopped':
        default:
            return 'bg-text-secondary/50';
    }
};

export function StatusBadge({ phase, running }: StatusBadgeProps): JSX.Element | null {
    const dotClass = getPhaseDotClass(phase, running);

    // Render a more complex "ping" animation for the active running state
    if (running || phase === 'ready') {
        return (
            <div className="relative flex h-3 w-3 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </div>
        );
    }

    // Render a simpler dot for other states
    return (
        <div className="relative flex h-3 w-3 items-center justify-center">
             <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
        </div>
    );
}
