import type { Machine } from '@/types/api'
import { CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PressableSurface } from '@/components/ui/pressable-surface'

function getMachineTitle(machine: Machine): string {
    if (machine.metadata?.displayName) return machine.metadata.displayName
    if (machine.metadata?.host) return machine.metadata.host
    return machine.id.slice(0, 8)
}

export function MachineList(props: {
    machines: Machine[]
    onSelect: (machineId: string) => void
}) {
    return (
        <div className="flex flex-col gap-3 p-3">
            <div className="text-xs text-[var(--app-hint)]">
                {props.machines.length} online
            </div>

            <div className="flex flex-col gap-3">
                {props.machines.map((m) => (
                    <PressableSurface
                        key={m.id}
                        type="button"
                        className="rounded-[var(--ds-radius-lg)] px-0 py-0"
                        onClick={() => props.onSelect(m.id)}
                    >
                        <CardHeader className="pb-2">
                            <CardTitle className="truncate">{getMachineTitle(m)}</CardTitle>
                            <CardDescription className="truncate">
                                {m.metadata?.platform ? m.metadata.platform : 'Unknown platform'}
                            </CardDescription>
                        </CardHeader>
                    </PressableSurface>
                ))}
            </div>
        </div>
    )
}
